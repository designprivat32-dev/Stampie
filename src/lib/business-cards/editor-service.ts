import 'server-only'
import QRCode from 'qrcode'
import { prisma } from '@/lib/db'
import { appUrl } from '@/lib/app-url'
import { loadOrCreateDraft } from '@/lib/cards/repository'
import { getStorage, variantKey } from '@/lib/storage'
import { scanUrlFor, toBusinessCompany, toBusinessContact } from './mapping'
import type { BusinessCompany, BusinessContact } from './schema'
import { contactPhotoUrl } from './photo-service'

/**
 * Was der Visitenkarten-Editor im Dashboard braucht, in einer Abfrage-Runde.
 *
 * Die QR-Codes werden hier erzeugt, nicht im Browser: dieselbe Bibliothek wie beim
 * Ausgabe-Dialog der Stempelkarte, und der Client bleibt ohne zusätzliche Abhängigkeit.
 */

export interface ContactStats {
  views: number
  walletAdds: number
  contactsSaved: number
  /** Empfänger-Pässe, die gerade existieren. */
  holders: number
  /** Hat die Person ihren eigenen Pass schon geholt? */
  ownerHasPass: boolean
}

export interface EditorContact {
  id: string
  contact: BusinessContact
  photoAssetId: string | null
  photoUrl: string | null
  scanUrl: string
  scanQr: string
  ownerUrl: string | null
  ownerQr: string | null
  stats: ContactStats
}

export interface BusinessEditorData {
  cardId: string
  cardName: string
  orgName: string | null
  design: {
    backgroundColor: string
    foregroundColor: string
    labelColor: string
    cardTitle: string
    logoAssetId: string | null
    logoUrl: string | null
  }
  publishedVersion: number | null
  company: BusinessCompany | null
  contacts: EditorContact[]
}

function qr(url: string): Promise<string> {
  return QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1, width: 384 })
}

export async function loadBusinessEditor(cardId: string): Promise<BusinessEditorData | null> {
  const card = await prisma.card.findFirst({
    where: { id: cardId, kind: 'BUSINESS_CARD' },
    select: {
      id: true,
      name: true,
      org: { select: { name: true } },
      businessCompany: {
        select: { company: true, website: true, phone: true, street: true, postalCode: true, city: true },
      },
      contacts: {
        where: { deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          firstName: true,
          lastName: true,
          jobTitle: true,
          phone: true,
          mobile: true,
          email: true,
          links: true,
          scanCode: true,
          ownerClaimToken: true,
          photoAssetId: true,
        },
      },
    },
  })
  if (!card) return null

  const contactIds = card.contacts.map((c) => c.id)
  const [draft, events, passes] = await Promise.all([
    loadOrCreateDraft(cardId),
    prisma.businessCardEvent.groupBy({
      by: ['contactId', 'kind'],
      where: { contactId: { in: contactIds } },
      _count: { _all: true },
    }),
    prisma.issuedPass.groupBy({
      by: ['contactId', 'role'],
      where: { contactId: { in: contactIds } },
      _count: { _all: true },
    }),
  ])

  const eventCount = (contactId: string, kind: string): number =>
    events.find((e) => e.contactId === contactId && e.kind === kind)?._count._all ?? 0
  const passCount = (contactId: string, role: string): number =>
    passes.find((p) => p.contactId === contactId && p.role === role)?._count._all ?? 0

  let logoUrl: string | null = null
  if (draft.design.logoAssetId) {
    const logo = await prisma.asset.findFirst({
      where: { id: draft.design.logoAssetId, cardId },
      select: { storageKey: true },
    })
    if (logo) logoUrl = (await getStorage()).publicUrl(variantKey(logo.storageKey, 1))
  }

  const contacts = await Promise.all(
    card.contacts.map(async (row): Promise<EditorContact> => {
      const scanUrl = scanUrlFor(row.scanCode)
      const ownerUrl = row.ownerClaimToken ? `${appUrl()}/v/claim/${row.ownerClaimToken}` : null
      const [scanQr, ownerQr, photoUrl] = await Promise.all([
        qr(scanUrl),
        ownerUrl ? qr(ownerUrl) : null,
        contactPhotoUrl(cardId, row.photoAssetId),
      ])
      return {
        id: row.id,
        contact: toBusinessContact(row),
        photoAssetId: row.photoAssetId,
        photoUrl,
        scanUrl,
        scanQr,
        ownerUrl,
        ownerQr,
        stats: {
          views: eventCount(row.id, 'VIEWED'),
          walletAdds: eventCount(row.id, 'WALLET_ADDED'),
          contactsSaved: eventCount(row.id, 'CONTACT_SAVED'),
          holders: passCount(row.id, 'HOLDER'),
          ownerHasPass: passCount(row.id, 'OWNER') > 0,
        },
      }
    }),
  )

  return {
    cardId: card.id,
    cardName: card.name,
    orgName: card.org?.name ?? null,
    design: {
      backgroundColor: draft.design.backgroundColor,
      foregroundColor: draft.design.foregroundColor,
      labelColor: draft.design.labelColor,
      cardTitle: draft.design.cardTitle ?? '',
      logoAssetId: draft.design.logoAssetId,
      logoUrl,
    },
    publishedVersion: draft.publishedVersion,
    company: toBusinessCompany(card.businessCompany),
    contacts,
  }
}
