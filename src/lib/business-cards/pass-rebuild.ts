import 'server-only'
import { prisma } from '@/lib/db'
import { loadPassAssets } from '@/lib/cards/asset-service'
import { loadOrCreateDraft, loadPublishedDesign } from '@/lib/cards/repository'
import { ensureAppleAuthToken } from '@/lib/pass/apple-passkit-auth'
import { buildBusinessApplePass } from './apple-pass-builder'
import { loadContactPhoto } from './photo-service'
import { privacyUrlFor, scanUrlFor, toBusinessCompany, toBusinessContact } from './mapping'

/**
 * Baut einen ausgegebenen Visitenkarten-Pass neu — für Apples „gib mir die neueste
 * Fassung" nach einem Push, genauso wie `lib/cards/pass-rebuild.ts` es für Stempelkarten tut.
 *
 * Die Abfrage verlangt Visitenkarte auf beiden Seiten (Pass und Karte) und eine Person:
 * ein Pass, der davon abweicht, wird nicht gebaut statt falsch.
 */
export async function rebuildBusinessPass(serial: string): Promise<Buffer | null> {
  const pass = await prisma.issuedPass.findFirst({
    where: {
      serial,
      kind: 'BUSINESS_CARD',
      card: { kind: 'BUSINESS_CARD' },
      contactId: { not: null },
    },
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
            select: {
              company: true,
              website: true,
              phone: true,
              street: true,
              postalCode: true,
              city: true,
            },
          },
        },
      },
    },
  })
  if (!pass?.contact) return null

  const design =
    (await loadPublishedDesign(pass.cardId)) ?? (await loadOrCreateDraft(pass.cardId)).design
  const [assets, appleAuthToken, photo] = await Promise.all([
    loadPassAssets(design, pass.cardId),
    ensureAppleAuthToken(pass.serial),
    loadContactPhoto(pass.cardId, pass.contact.photoAssetId),
  ])

  return buildBusinessApplePass({
    design,
    contact: toBusinessContact(pass.contact),
    company: toBusinessCompany(pass.card.businessCompany),
    role: pass.role,
    serial: pass.serial,
    scanUrl: scanUrlFor(pass.contact.scanCode),
    privacyUrl: privacyUrlFor(pass.contact.scanCode),
    assets: { icon: assets.icon, logo: assets.logo, photo },
    appleAuthToken,
    voided: pass.contact.deletedAt !== null,
  })
}
