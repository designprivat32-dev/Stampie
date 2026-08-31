'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { assertCardAccess, isAdminSession, requireSession } from '@/lib/auth/session'
import { assertPassword } from '@/lib/auth/reauth'
import { fail, fromZodError, guarded, ok, type ActionResult } from '@/lib/action-result'
import { prisma } from '@/lib/db'
import { accessibleOrgIds, listCards, listCustomers, type CardSummary } from '@/lib/cards/card-service'
import { designToRow } from '@/lib/cards/repository'
import { DEFAULT_CARD_DESIGN } from '@/lib/cards/defaults'
import { getTemplate, templateAsDesign } from '@/lib/cards/templates'
import { cardKindSchema } from '@/lib/cards/schema'

/**
 * Card lifecycle: list, create, assign, delete.
 *
 * Everything here is scoped by what the caller may see. `accessibleOrgIds` returns null
 * for the dashboard operator, which the queries read as "no restriction"; customer logins
 * never arrive here, they go through the app API.
 */

const createInputSchema = z.object({
  name: z.string().min(1, 'Bitte einen Namen für die Karte angeben.').max(60),
  /**
   * Fixed here for good: the wallet pass type follows from it and is baked into every pass
   * handed out afterwards, so there is deliberately no action to change it later.
   */
  kind: cardKindSchema.default('STAMP'),
  orgId: z.string().cuid().nullable().default(null),
  /** Optional industry preset, so a new card is not born blank. */
  templateId: z.string().max(40).nullable().default(null),
})

const assignInputSchema = z.object({
  cardId: z.string().cuid(),
  orgId: z.string().cuid().nullable(),
})

export async function listCardsAction(): Promise<ActionResult<CardSummary[]>> {
  return guarded(async () => {
    const session = await requireSession()
    const orgIds = await accessibleOrgIds(session.userId)
    return ok(await listCards({ orgIds }))
  })
}

export async function listCustomersAction(): Promise<
  ActionResult<Array<{ id: string; name: string }>>
> {
  return guarded(async () => {
    const session = await requireSession()
    const orgIds = await accessibleOrgIds(session.userId)
    return ok(await listCustomers(orgIds))
  })
}

/**
 * Creates a card and its draft design in one go, so the designer always opens on something
 * that exists rather than creating rows as a side effect of a page load.
 */
export async function createCardAction(input: unknown): Promise<ActionResult<{ cardId: string }>> {
  return guarded(async () => {
    const parsed = createInputSchema.safeParse(input)
    if (!parsed.success) return fromZodError(parsed.error)

    const session = await requireSession()
    const orgIds = await accessibleOrgIds(session.userId)

    // A customer can only ever create cards for their own organisation.
    if (orgIds !== null) {
      const target = parsed.data.orgId ?? orgIds[0] ?? null
      if (!target || !orgIds.includes(target)) {
        return fail('Für diesen Betrieb dürfen keine Karten angelegt werden.', 'forbidden')
      }
    }

    const orgId = parsed.data.orgId ?? (orgIds !== null ? (orgIds[0] ?? null) : null)

    // Templates set stamp colours, icons and texts — none of which a coupon has, so a
    // coupon starts from the defaults even if a template was picked.
    const template =
      parsed.data.kind === 'STAMP' && parsed.data.templateId
        ? getTemplate(parsed.data.templateId)
        : undefined
    const design = template ? templateAsDesign(template) : DEFAULT_CARD_DESIGN

    const card = await prisma.card.create({
      data: {
        name: parsed.data.name.trim(),
        kind: parsed.data.kind,
        orgId,
        createdBy: session.userId,
        designs: { create: { status: 'DRAFT', ...designToRow(design) } },
      },
      select: { id: true },
    })

    revalidatePath('/dashboard/karten')
    return ok({ cardId: card.id })
  })
}

/** Hands a card to a customer — or takes it back, which also removes the right to stamp. */
export async function assignCardAction(input: unknown): Promise<ActionResult<null>> {
  return guarded(async () => {
    const parsed = assignInputSchema.safeParse(input)
    if (!parsed.success) return fromZodError(parsed.error)

    const session = await requireSession()
    if (!(await isAdminSession(session.userId))) {
      return fail('Karten zuweisen darf nur die Verwaltung.', 'forbidden')
    }
    await assertCardAccess(parsed.data.cardId)

    if (parsed.data.orgId) {
      const org = await prisma.organization.findFirst({
        where: { id: parsed.data.orgId },
        select: { id: true },
      })
      if (!org) return fail('Dieser Betrieb wurde nicht gefunden.', 'not_found')
    }

    await prisma.card.update({
      where: { id: parsed.data.cardId },
      data: { orgId: parsed.data.orgId },
    })

    revalidatePath('/dashboard/karten')
    return ok(null)
  })
}

export async function renameCardAction(cardId: string, name: string): Promise<ActionResult<null>> {
  return guarded(async () => {
    const parsed = z
      .object({ cardId: z.string().cuid(), name: z.string().min(1).max(60) })
      .safeParse({ cardId, name })
    if (!parsed.success) return fromZodError(parsed.error)

    await assertCardAccess(parsed.data.cardId)
    await prisma.card.update({
      where: { id: parsed.data.cardId },
      data: { name: parsed.data.name.trim() },
    })

    revalidatePath('/dashboard/karten')
    return ok(null)
  })
}

/**
 * Löscht die Karte — endgültig, ohne Zwischenzustand.
 *
 * Es gab hier einmal ein Archiv. Das hat mehr Schaden angerichtet als verhindert: die
 * Karte verschwand aus allen Listen, ihre Pässe blieben aber stempelbar, und die Kasse
 * meldete Erfolg für eine Buchung, die danach nirgends mehr auftauchte.
 *
 * Was mitgeht, weil die Fremdschlüssel auf `ON DELETE CASCADE` stehen: Designs und deren
 * Versionen, Bilder, Nachrichten, Testkarten-Token, alle ausgegebenen Pässe samt
 * Wallet-Registrierungen und die gesamte Stempel-Historie. Pässe, die Kunden im Wallet
 * haben, aktualisieren sich danach nicht mehr — sie frieren auf ihrem letzten Stand ein.
 * Deshalb fragt die Oberfläche vorher nach und nennt die Zahl der Karten im Umlauf, und
 * deshalb verlangt die Aktion zusätzlich das Passwort des Betreibers (`lib/auth/reauth`):
 * eine offene Sitzung allein darf nicht reichen, um fremde Kundenhistorie zu vernichten.
 */
export async function deleteCardAction(
  cardId: string,
  password: string,
): Promise<ActionResult<null>> {
  return guarded(async () => {
    const parsed = z.object({ cardId: z.string().cuid() }).safeParse({ cardId })
    if (!parsed.success) return fromZodError(parsed.error)

    await assertCardAccess(parsed.data.cardId)
    // After the tenancy check, so a wrong password never doubles as a way to probe which
    // card ids exist.
    await assertPassword(password, 'card-delete')

    await prisma.card.delete({ where: { id: parsed.data.cardId } })

    revalidatePath('/dashboard/karten')
    return ok(null)
  })
}
