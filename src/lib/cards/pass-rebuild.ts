import 'server-only'
import { prisma } from '@/lib/db'
import { getPassBuilder } from '@/lib/pass/mock-pass-builder'
import { loadPassAssets } from './asset-service'
import { loadOrCreateDraft, loadPublishedDesign } from './repository'
import { ensureAppleAuthToken } from '@/lib/pass/apple-passkit-auth'

/**
 * Rebuilds an already-issued pass at its current stamp count.
 *
 * Apple's web service asks for "the latest version of this pass" and expects the whole
 * `.pkpass` back, not a diff — there is no partial update in PassKit. So the bundle is
 * regenerated from scratch on every request, stamp row and all, which is exactly what
 * `renderStripImageSet` exists for.
 *
 * The design used is the published one where it exists, falling back to the draft for a
 * card still being set up — same rule the till uses, so a pass never shows a state the
 * counter disagrees with.
 */
export async function rebuildIssuedPass(serial: string): Promise<Buffer | null> {
  const pass = await prisma.issuedPass.findFirst({
    where: { serial },
    select: {
      serial: true,
      stamps: true,
      kind: true,
      cardId: true,
      activeMessage: true,
      marketingConsentAt: true,
      card: {
        select: { name: true, activeMessage: true, org: { select: { name: true } } },
      },
    },
  })
  if (!pass) return null

  const design =
    (await loadPublishedDesign(pass.cardId)) ?? (await loadOrCreateDraft(pass.cardId)).design
  const [assets, appleAuthToken] = await Promise.all([
    loadPassAssets(design, pass.cardId),
    ensureAppleAuthToken(pass.serial),
  ])

  return getPassBuilder().buildApplePass(
    {
      ...design,
      cardId: pass.cardId,
      kind: pass.kind,
      organizationName: pass.card.org?.name ?? pass.card.name,
      currentStamps: pass.stamps,
      assets,
      appleAuthToken,
      /*
       * Die Nachricht des Passes hat Vorrang: sie ist die an eine Gruppe, die der Karte
       * die an alle. Wer zuletzt einzeln angeschrieben wurde, soll nicht plötzlich wieder
       * den alten Rundruf sehen. Ein Versand an alle räumt die Pass-Nachrichten ab, damit
       * dieser Vorrang nicht zur Sackgasse wird.
       */
      message: pass.activeMessage ?? pass.card.activeMessage,
      // Traegt den Widerruf-Link auf die Rueckseite — automatisch, ohne Zutun im Designer.
      marketingConsent: pass.marketingConsentAt !== null,
    },
    pass.serial,
  )
}
