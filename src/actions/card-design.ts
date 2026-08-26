'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { assertCardAccess } from '@/lib/auth/session'
import { fail, fromZodError, guarded, ok, type ActionResult } from '@/lib/action-result'
import {
  buildPublishSchema,
  cardDesignDraftSchema,
  contrastRatioForDesign,
  publishInputSchema,
  restoreVersionInputSchema,
  saveDraftInputSchema,
  CONTRAST_BLOCK_THRESHOLD,
  type CardDesignInput,
} from '@/lib/cards/schema'
import {
  countAffectedPasses,
  geoLocationCount,
  listVersions,
  loadVersionSnapshot,
  publishDesign,
  saveDraft,
  setGeoNotifications,
  type VersionSummary,
} from '@/lib/cards/repository'
import { applyTemplate, getTemplate } from '@/lib/cards/templates'
import { invalidateStripCache } from '@/lib/cards/strip-service'
import { syncGoogleClass } from '@/lib/wallet/google-sync'
import { pushAppleWalletUpdateForCard } from '@/lib/wallet/apple-sync'
import { cardKind, issuerName, organizationGeoSeed } from '@/lib/cards/card-service'

/**
 * Every action re-validates against the same Zod schema the client uses. Client-side
 * validation is convenience; this is the boundary that actually decides.
 */

export interface SaveDraftResult {
  savedAt: string
  design: CardDesignInput
}

export async function saveDraftAction(input: unknown): Promise<ActionResult<SaveDraftResult>> {
  return guarded(async () => {
    const parsed = saveDraftInputSchema.safeParse(input)
    if (!parsed.success) return fromZodError(parsed.error)

    await assertCardAccess(parsed.data.cardId)

    const saved = await saveDraft(parsed.data.cardId, parsed.data.design)
    invalidateStripCache()

    return ok({ savedAt: saved.updatedAt.toISOString(), design: saved.design })
  })
}

export interface PublishResultPayload {
  version: number
  affectedPasses: number
  publishedAt: string
}

export async function publishAction(input: unknown): Promise<ActionResult<PublishResultPayload>> {
  return guarded(async () => {
    const parsed = publishInputSchema.safeParse(input)
    if (!parsed.success) return fromZodError(parsed.error)

    const { session, cardId } = await assertCardAccess(parsed.data.cardId)

    const kind = await cardKind(cardId)
    const schema = buildPublishSchema({
      contrastConfirmed: parsed.data.confirmLowContrast,
      kind,
    })
    const validated = schema.safeParse(parsed.data.design)
    if (!validated.success) return fromZodError(validated.error)

    const contrastOverride =
      contrastRatioForDesign(validated.data) < CONTRAST_BLOCK_THRESHOLD &&
      parsed.data.confirmLowContrast

    const result = await publishDesign(cardId, validated.data, session.userId, {
      contrastOverride,
      ...(parsed.data.note ? { note: parsed.data.note } : {}),
    })
    invalidateStripCache()

    // Cards already in a wallet follow the class, so publishing has to reach it too.
    await syncGoogleClass(cardId, validated.data, await issuerName(cardId), kind)

    // Apple has no class to update — every installed pass has to be knocked on
    // individually, or the new design sits on the server and reaches nobody until that
    // customer happens to collect a stamp. Awaited rather than left running: a promise
    // that outlives the response is not guaranteed to finish on a serverless runtime, and
    // a publish that silently reached half the phones is worse than one that took a moment.
    await pushAppleWalletUpdateForCard(cardId)

    revalidatePath(`/dashboard/karten/${cardId}`)

    return ok({
      version: result.version,
      affectedPasses: result.affectedPasses,
      publishedAt: result.publishedAt.toISOString(),
    })
  })
}

const geoNotificationsInputSchema = z.object({
  cardId: z.string().cuid(),
  enabled: z.boolean(),
})

/**
 * Der Schalter aus der Kartenübersicht.
 *
 * Er greift ohne den Umweg über Entwurf und Veröffentlichen, weil er nichts am Aussehen
 * der Karte ändert: entweder gehen die hinterlegten Standorte mit in den Pass oder nicht.
 * Deshalb wandert er direkt auf beide Design-Zeilen und von dort in die Wallets — ein
 * Schalter in einer Übersicht, der erst nach einem Veröffentlichen wirkt, wäre eine Lüge.
 *
 * Einschalten ohne hinterlegten Standort holt den Standort des Betriebs. Fehlt der auch,
 * scheitert die Aktion mit Ansage, statt eine Benachrichtigung um nichts herum anzulegen.
 */
export async function setGeoNotificationsAction(input: unknown): Promise<ActionResult<null>> {
  return guarded(async () => {
    const parsed = geoNotificationsInputSchema.safeParse(input)
    if (!parsed.success) return fromZodError(parsed.error)

    const { cardId, enabled } = parsed.data
    await assertCardAccess(cardId)

    const seedLocation = enabled ? await organizationGeoSeed(cardId) : null
    if (enabled && seedLocation === null && (await geoLocationCount(cardId)) === 0) {
      return fail(
        'Für diesen Betrieb ist kein Standort hinterlegt. Koordinaten im Designer unter „Erweitert" eintragen.',
        'validation',
      )
    }

    const published = await setGeoNotifications(cardId, { enabled, seedLocation })

    // Karten im Umlauf folgen der veröffentlichten Fassung — die muss die Wallets erreichen,
    // sonst benachrichtigt ein abgeschalteter Standort noch wochenlang weiter.
    if (published !== null) {
      await syncGoogleClass(cardId, published, await issuerName(cardId), await cardKind(cardId))
      await pushAppleWalletUpdateForCard(cardId)
    }

    revalidatePath('/dashboard/karten')
    revalidatePath(`/dashboard/karten/${cardId}`)

    return ok(null)
  })
}

export async function affectedPassCountAction(cardId: string): Promise<ActionResult<number>> {
  return guarded(async () => {
    await assertCardAccess(cardId)
    return ok(await countAffectedPasses(cardId))
  })
}

export async function listVersionsAction(
  cardId: string,
): Promise<ActionResult<VersionSummary[]>> {
  return guarded(async () => {
    await assertCardAccess(cardId)
    return ok(await listVersions(cardId))
  })
}

/**
 * Restores a published version *into the draft*, not directly into production — the user
 * gets to look at it in the preview and publish deliberately.
 */
export async function restoreVersionAction(input: unknown): Promise<ActionResult<CardDesignInput>> {
  return guarded(async () => {
    const parsed = restoreVersionInputSchema.safeParse(input)
    if (!parsed.success) return fromZodError(parsed.error)

    await assertCardAccess(parsed.data.cardId)

    const snapshot = await loadVersionSnapshot(parsed.data.cardId, parsed.data.versionId)
    if (!snapshot) return fail('Diese Version wurde nicht gefunden.', 'not_found')

    const saved = await saveDraft(parsed.data.cardId, snapshot)
    invalidateStripCache()
    return ok(saved.design)
  })
}

export async function applyTemplateAction(
  cardId: string,
  templateId: string,
  currentDesign: unknown,
): Promise<ActionResult<CardDesignInput>> {
  return guarded(async () => {
    await assertCardAccess(cardId)

    const template = getTemplate(templateId)
    if (!template) return fail('Diese Vorlage gibt es nicht.', 'not_found')

    const parsed = cardDesignDraftSchema.safeParse(currentDesign)
    if (!parsed.success) return fromZodError(parsed.error)

    const next = applyTemplate(parsed.data, template)
    const saved = await saveDraft(cardId, next)
    invalidateStripCache()
    return ok(saved.design)
  })
}
