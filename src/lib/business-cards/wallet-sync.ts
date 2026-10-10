import 'server-only'
import { prisma } from '@/lib/db'
import { loadPublishedDesign } from '@/lib/cards/repository'
import { pushAppleWalletUpdateForPasses } from '@/lib/wallet/apple-sync'
import { syncBusinessGoogleObjects, type BusinessGoogleInput } from './google-pass'
import { contactPhotoUrl } from './photo-service'
import { privacyUrlFor, scanUrlFor, toBusinessCompany, toBusinessContact } from './mapping'

/**
 * Bringt ausgegebene Visitenkarten nach einer Änderung auf den neuen Stand — bei Apple
 * per Push (das Telefon holt sich den Pass neu), bei Google per Überschreiben des Objekts.
 *
 * Fehler werden gezählt und geloggt, nicht geworfen: die Änderung ist gespeichert, und ein
 * nicht erreichbarer Wallet-Dienst darf das nicht rückgängig aussehen lassen.
 */

export interface BusinessWalletSyncSummary {
  applePasses: number
  googleUpdated: number
  failed: number
}

const EMPTY: BusinessWalletSyncSummary = { applePasses: 0, googleUpdated: 0, failed: 0 }

interface SyncOptions {
  /** Alles entwerten, egal ob die Person noch existiert — vor dem Löschen der ganzen Karte. */
  voidAll?: boolean
}

async function syncWhere(
  where: { cardId: string } | { contactId: string },
  options: SyncOptions = {},
): Promise<BusinessWalletSyncSummary> {
  const passes = await prisma.issuedPass.findMany({
    where: { ...where, kind: 'BUSINESS_CARD', contactId: { not: null } },
    select: {
      serial: true,
      role: true,
      cardId: true,
      contact: {
        select: {
          firstName: true,
          lastName: true,
          jobTitle: true,
          phone: true,
          mobile: true,
          email: true,
          links: true,
          scanCode: true,
          deletedAt: true,
          photoAssetId: true,
        },
      },
      card: {
        select: {
          businessCompany: {
            select: { company: true, website: true, phone: true, street: true, postalCode: true, city: true },
          },
        },
      },
    },
  })
  if (passes.length === 0) return EMPTY

  const summary = { ...EMPTY }

  // Vor dem Löschen der Karte hilft ein Apple-Push nicht: das Telefon fragt erst Minuten
  // später nach, und dann gibt es den Pass schon nicht mehr.
  if (!options.voidAll) {
    try {
      const apple = await pushAppleWalletUpdateForPasses(passes.map((p) => p.serial))
      summary.applePasses = apple.passes
      summary.failed += apple.failed
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[business-card] apple update failed', error)
      summary.failed++
    }
  }

  try {
    // Alle Pässe hängen an derselben Karte, also an einem Design.
    const design = await loadPublishedDesign(passes[0]!.cardId)
    if (design) {
      // Ein Foto je Person, nicht je Pass nachschlagen.
      const photoUrls = new Map<string, string | null>()
      for (const p of passes) {
        const id = p.contact?.photoAssetId
        if (id && !photoUrls.has(id)) photoUrls.set(id, await contactPhotoUrl(p.cardId, id))
      }
      const inputs: BusinessGoogleInput[] = passes.flatMap((p) =>
        p.contact
          ? [
              {
                cardId: p.cardId,
                design,
                contact: toBusinessContact(p.contact),
                company: toBusinessCompany(p.card.businessCompany),
                role: p.role,
                serial: p.serial,
                scanUrl: scanUrlFor(p.contact.scanCode),
                privacyUrl: privacyUrlFor(p.contact.scanCode),
                voided: options.voidAll === true || p.contact.deletedAt !== null,
                photoUrl: p.contact.photoAssetId ? (photoUrls.get(p.contact.photoAssetId) ?? null) : null,
              },
            ]
          : [],
      )
      const google = await syncBusinessGoogleObjects(inputs)
      summary.googleUpdated = google.updated
      summary.failed += google.failed
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[business-card] google update failed', error)
    summary.failed++
  }

  return summary
}

/** Nach Änderungen an Design oder Firmendaten: alle Pässe der Karte. */
export function syncBusinessCard(cardId: string): Promise<BusinessWalletSyncSummary> {
  return syncWhere({ cardId })
}

/**
 * Vor dem Löschen einer Visitenkarte: Google-Pässe deaktivieren, solange es sie noch gibt.
 * Apple-Pässe frieren auf ihrem letzten Stand ein, wie bei gelöschten Stempelkarten.
 */
export function deactivateBusinessCard(cardId: string): Promise<BusinessWalletSyncSummary> {
  return syncWhere({ cardId }, { voidAll: true })
}

/** Nach Änderungen an einer Person: nur ihre Pässe. */
export function syncBusinessContact(contactId: string): Promise<BusinessWalletSyncSummary> {
  return syncWhere({ contactId })
}
