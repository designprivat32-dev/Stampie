'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { assertCardAccess, isAgency, requireSession } from '@/lib/auth/session'
import { fail, fromZodError, guarded, ok, type ActionResult } from '@/lib/action-result'
import { prisma } from '@/lib/db'
import { accessibleOrgIds, listCards, listCustomers, type CardSummary } from '@/lib/cards/card-service'
import { designToRow } from '@/lib/cards/repository'
import { DEFAULT_CARD_DESIGN } from '@/lib/cards/defaults'
import { getTemplate, templateAsDesign } from '@/lib/cards/templates'

/**
 * Card lifecycle: list, create, assign, archive.
 *
 * Everything here is scoped by what the caller may see — agency members reach every card,
 * customers only their own organisation's. `accessibleOrgIds` returns null for agency,
 * which the queries read as "no restriction".
 */

const createInputSchema = z.object({
  name: z.string().min(1, 'Bitte einen Namen für die Karte angeben.').max(60),
  orgId: z.string().cuid().nullable().default(null),
  locationId: z.string().cuid().nullable().default(null),
  /** Optional industry preset, so a new card is not born blank. */
  templateId: z.string().max(40).nullable().default(null),
})

const assignInputSchema = z.object({
  cardId: z.string().cuid(),
  orgId: z.string().cuid().nullable(),
  locationId: z.string().cuid().nullable().default(null),
})

export async function listCardsAction(): Promise<ActionResult<CardSummary[]>> {
  return guarded(async () => {
    const session = await requireSession()
    const orgIds = await accessibleOrgIds(session.userId)
    return ok(await listCards({ orgIds }))
  })
}

export async function listCustomersAction(): Promise<
  ActionResult<Array<{ id: string; name: string; locations: Array<{ id: string; name: string }> }>>
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

    if (parsed.data.locationId) {
      const location = await prisma.location.findFirst({
        where: { id: parsed.data.locationId, ...(orgId ? { orgId } : {}) },
        select: { id: true },
      })
      if (!location) return fail('Diese Filiale gehört nicht zum gewählten Betrieb.', 'validation')
    }

    const template = parsed.data.templateId ? getTemplate(parsed.data.templateId) : undefined
    const design = template ? templateAsDesign(template) : DEFAULT_CARD_DESIGN

    const card = await prisma.card.create({
      data: {
        name: parsed.data.name.trim(),
        orgId,
        locationId: parsed.data.locationId,
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
    if (!(await isAgency(session.userId))) {
      return fail('Nur das Agentur-Team darf Karten zuweisen.', 'forbidden')
    }
    await assertCardAccess(parsed.data.cardId)

    if (parsed.data.orgId) {
      const org = await prisma.organization.findFirst({
        where: { id: parsed.data.orgId },
        select: { id: true },
      })
      if (!org) return fail('Dieser Betrieb wurde nicht gefunden.', 'not_found')
    }

    if (parsed.data.locationId) {
      const location = await prisma.location.findFirst({
        where: { id: parsed.data.locationId, orgId: parsed.data.orgId ?? undefined },
        select: { id: true },
      })
      if (!location) return fail('Diese Filiale gehört nicht zum gewählten Betrieb.', 'validation')
    }

    await prisma.card.update({
      where: { id: parsed.data.cardId },
      data: { orgId: parsed.data.orgId, locationId: parsed.data.locationId },
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
 * Archiving rather than deleting: passes already in customers' wallets keep referring to
 * this card, and their history has to stay readable.
 */
export async function archiveCardAction(
  cardId: string,
  archived: boolean,
): Promise<ActionResult<null>> {
  return guarded(async () => {
    const parsed = z.object({ cardId: z.string().cuid() }).safeParse({ cardId })
    if (!parsed.success) return fromZodError(parsed.error)

    await assertCardAccess(parsed.data.cardId)
    await prisma.card.update({
      where: { id: parsed.data.cardId },
      data: { archivedAt: archived ? new Date() : null },
    })

    revalidatePath('/dashboard/karten')
    return ok(null)
  })
}
