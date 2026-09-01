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
        select: { name: true, org: { select: { name: true } } },
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
       * Nur die Nachricht des Passes.
       *
       * Früher fiel das hier auf `card.activeMessage` zurück, weil ein Versand an alle den
       * Text auf der Karte ablegte. Seit der Versand pro Pass läuft, schreibt nichts mehr
       * dorthin — der Rückgriff hätte nur noch alte Texte an frisch ausgegebene Karten
       * vererbt. Genau das ist passiert: eine Karte, die 2026-08-29 einmal "test" bekam,
       * begrüßte jeden neuen Kunden damit. Und er umging die Einwilligung, weil ein Pass
       * ohne Häkchen den Kartentext trotzdem erbte.
       */
      message: pass.activeMessage,
      // Traegt den Widerruf-Link auf die Rueckseite — automatisch, ohne Zutun im Designer.
      marketingConsent: pass.marketingConsentAt !== null,
    },
    pass.serial,
  )
}
