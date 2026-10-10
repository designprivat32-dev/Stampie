'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { assertCardAccess, CardAccessError, type CardAccess } from '@/lib/auth/session'
import { fail, fromZodError, guarded, ok, type ActionResult } from '@/lib/action-result'
import { prisma } from '@/lib/db'
import { cardDesignDraftSchema, hexColorSchema } from '@/lib/cards/schema'
import { loadOrCreateDraft, publishDesign, saveDraft } from '@/lib/cards/repository'
import { invalidateStripCache } from '@/lib/cards/strip-service'
import { pushAppleWalletUpdateForCard, pushAppleWalletUpdateForPasses } from '@/lib/wallet/apple-sync'
import { businessCompanySchema, businessContactSchema } from '@/lib/business-cards/schema'
import { newOwnerClaimToken, newScanCode } from '@/lib/business-cards/serial'

/**
 * Alles, was der Visitenkarten-Editor im Dashboard speichert.
 *
 * Jede Aktion prüft zuerst den Zugriff auf die Karte und dann, dass es wirklich eine
 * Visitenkarte ist — eine Stempelkarte bekommt hier weder Firmendaten noch Personen.
 * Nach dem Speichern wird an die ausgegebenen Pässe geklopft, damit Wallet die neue
 * Fassung holt; scheitert das, bleibt das Gespeicherte trotzdem gespeichert.
 */

const cardIdSchema = z.string().cuid()

async function assertBusinessCardAccess(cardId: string): Promise<CardAccess> {
  const access = await assertCardAccess(cardId)
  const card = await prisma.card.findFirst({
    where: { id: cardId, kind: 'BUSINESS_CARD' },
    select: { id: true },
  })
  if (!card) throw new CardAccessError('Visitenkarte nicht gefunden.')
  return access
}

async function assertContactAccess(contactId: string): Promise<{ cardId: string; access: CardAccess }> {
  const contact = await prisma.businessContact.findFirst({
    where: { id: contactId },
    select: { cardId: true },
  })
  if (!contact) throw new CardAccessError('Person nicht gefunden.')
  return { cardId: contact.cardId, access: await assertBusinessCardAccess(contact.cardId) }
}

/** Updates anstoßen, ohne dass ein Fehler dabei das Speichern ungeschehen wirken lässt. */
async function pushQuietly(run: () => Promise<unknown>): Promise<void> {
  try {
    await run()
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[business-card] wallet update failed', error)
  }
}

async function pushContact(contactId: string): Promise<void> {
  const passes = await prisma.issuedPass.findMany({ where: { contactId }, select: { serial: true } })
  await pushQuietly(() => pushAppleWalletUpdateForPasses(passes.map((p) => p.serial)))
}

function revalidate(cardId: string): void {
  revalidatePath(`/dashboard/karten/${cardId}`)
  revalidatePath('/dashboard/karten')
}

// ---------------------------------------------------------------- design

const designInputSchema = z.object({
  cardId: cardIdSchema,
  backgroundColor: hexColorSchema,
  foregroundColor: hexColorSchema,
  labelColor: hexColorSchema,
  cardTitle: z.string().trim().max(40).nullable(),
  logoAssetId: z.string().cuid().nullable(),
})

/**
 * Speichert Farben und Logo und veröffentlicht sofort.
 *
 * Bei der Visitenkarte gibt es keinen Grund für einen Entwurf: es gibt nichts
 * auszuprobieren, was die Kunden nicht ohnehin gleich sehen sollen, und ohne
 * veröffentlichtes Design zeigt die Scan-Seite nichts an.
 */
export async function saveBusinessDesignAction(input: unknown): Promise<ActionResult<{ version: number }>> {
  return guarded(async () => {
    const parsed = designInputSchema.safeParse(input)
    if (!parsed.success) return fromZodError(parsed.error)
    const { cardId, logoAssetId, cardTitle, ...colors } = parsed.data
    const { session } = await assertBusinessCardAccess(cardId)

    if (logoAssetId) {
      const logo = await prisma.asset.findFirst({
        where: { id: logoAssetId, cardId, kind: 'LOGO' },
        select: { id: true },
      })
      if (!logo) return fail('Das Logo wurde nicht gefunden.', 'not_found')
    }

    const draft = await loadOrCreateDraft(cardId)
    const merged = cardDesignDraftSchema.safeParse({
      ...draft.design,
      ...colors,
      cardTitle: cardTitle || null,
      logoAssetId,
    })
    if (!merged.success) return fromZodError(merged.error)

    await saveDraft(cardId, merged.data)
    const published = await publishDesign(cardId, merged.data, session.userId, {
      contrastOverride: false,
      note: 'Visitenkarte',
    })
    invalidateStripCache()
    await pushQuietly(() => pushAppleWalletUpdateForCard(cardId))

    revalidate(cardId)
    return ok({ version: published.version })
  })
}

// ---------------------------------------------------------------- company

export async function saveBusinessCompanyAction(input: unknown): Promise<ActionResult<null>> {
  return guarded(async () => {
    const parsed = businessCompanySchema.extend({ cardId: cardIdSchema }).safeParse(input)
    if (!parsed.success) return fromZodError(parsed.error)
    const { cardId, ...company } = parsed.data
    await assertBusinessCardAccess(cardId)

    await prisma.businessCardCompany.upsert({
      where: { cardId },
      create: { cardId, ...company },
      update: company,
    })
    await pushQuietly(() => pushAppleWalletUpdateForCard(cardId))

    revalidate(cardId)
    return ok(null)
  })
}

// ---------------------------------------------------------------- contacts

export async function createContactAction(input: unknown): Promise<ActionResult<{ contactId: string }>> {
  return guarded(async () => {
    const parsed = businessContactSchema.extend({ cardId: cardIdSchema }).safeParse(input)
    if (!parsed.success) return fromZodError(parsed.error)
    const { cardId, ...contact } = parsed.data
    await assertBusinessCardAccess(cardId)

    const count = await prisma.businessContact.count({ where: { cardId } })
    const created = await prisma.businessContact.create({
      data: {
        cardId,
        ...contact,
        scanCode: newScanCode(),
        ownerClaimToken: newOwnerClaimToken(),
        sortOrder: count,
      },
      select: { id: true },
    })

    revalidate(cardId)
    return ok({ contactId: created.id })
  })
}

export async function updateContactAction(input: unknown): Promise<ActionResult<null>> {
  return guarded(async () => {
    const parsed = businessContactSchema.extend({ contactId: z.string().cuid() }).safeParse(input)
    if (!parsed.success) return fromZodError(parsed.error)
    const { contactId, ...contact } = parsed.data
    const { cardId } = await assertContactAccess(contactId)

    await prisma.businessContact.update({ where: { id: contactId }, data: contact })
    await pushContact(contactId)

    revalidate(cardId)
    return ok(null)
  })
}

/**
 * Entfernt eine Person samt ihrer Pässe.
 *
 * Die Pässe in fremden Wallets bleiben dort liegen, bekommen aber keine Updates mehr —
 * sie sauber als ungültig zu markieren kommt mit Phase 6.
 */
export async function deleteContactAction(contactId: string): Promise<ActionResult<null>> {
  return guarded(async () => {
    const parsed = z.string().cuid().safeParse(contactId)
    if (!parsed.success) return fail('Ungültige Person.', 'validation')
    const { cardId } = await assertContactAccess(parsed.data)

    await prisma.businessContact.delete({ where: { id: parsed.data } })

    revalidate(cardId)
    return ok(null)
  })
}

/** Neuer Link für den Aussteller-Pass; der alte funktioniert danach nicht mehr. */
export async function renewOwnerLinkAction(contactId: string): Promise<ActionResult<null>> {
  return guarded(async () => {
    const parsed = z.string().cuid().safeParse(contactId)
    if (!parsed.success) return fail('Ungültige Person.', 'validation')
    const { cardId } = await assertContactAccess(parsed.data)

    await prisma.businessContact.update({
      where: { id: parsed.data },
      data: { ownerClaimToken: newOwnerClaimToken() },
    })

    revalidate(cardId)
    return ok(null)
  })
}
