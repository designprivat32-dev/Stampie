import type {
  GoogleImageUri,
  GoogleLinkModuleUri,
  GoogleTextModule,
} from '@/lib/cards/google-loyalty'
import type { CardDesignInput } from '@/lib/cards/schema'
import { displayUrl, fullName, type BusinessPassRole } from './apple-pass-json'
import type { BusinessCompany, BusinessContact } from './schema'

/**
 * Visitenkarte -> Google Wallet `GenericClass` / `GenericObject`.
 *
 * Generic ist Googles Pass-Typ für alles, was weder Kundenkarte noch Gutschein ist, und
 * steht jedem Issuer-Konto ohne eigene Freigabe zur Verfügung. Der Inhalt sitzt fast ganz im
 * Objekt — die Klasse ist nur die Klammer, über die Google die Pässe einer Karte zuordnet.
 *
 * Wie bei Apple: der Aussteller bekommt den QR-Code zur Scan-Seite, der Empfänger keinen.
 */

interface LocalizedString {
  defaultValue: { language: 'de'; value: string }
}

export interface GenericClass {
  id: string
}

export interface GenericObject {
  id: string
  classId: string
  state: 'ACTIVE' | 'INACTIVE'
  cardTitle: LocalizedString
  header: LocalizedString
  subheader?: LocalizedString
  logo: GoogleImageUri
  hexBackgroundColor: string
  textModulesData: GoogleTextModule[]
  linksModuleData: { uris: GoogleLinkModuleUri[] }
  barcode?: { type: 'QR_CODE'; value: string; alternateText: string }
  imageModulesData?: Array<{ id: string; mainImage: GoogleImageUri }>
}

export interface BusinessGoogleContext {
  issuerId: string
  cardId: string
  serial: string
  role: BusinessPassRole
  scanUrl: string
  privacyUrl: string
  logoUrl: string
  /** Die Person wurde gelöscht — Objekt deaktivieren, Code entfernen. */
  voided?: boolean
  /** Öffentliche Adresse des Fotos; Google zeigt es in den Details der Karte. */
  photoUrl?: string | null
}

function text(value: string): LocalizedString {
  return { defaultValue: { language: 'de', value } }
}

/** Eigene Präfixe, damit nie eine Klasse oder ein Objekt der Stempelkarte getroffen wird. */
export function businessClassId(issuerId: string, cardId: string): string {
  return `${issuerId}.bcard_${cardId}`
}

export function businessObjectId(issuerId: string, serial: string): string {
  return `${issuerId}.bsn_${serial.replace(/[^A-Za-z0-9._-]/g, '_')}`
}

export function buildBusinessGenericClass(issuerId: string, cardId: string): GenericClass {
  return { id: businessClassId(issuerId, cardId) }
}

function telUri(phone: string): string {
  return `tel:${phone.replace(/[^+0-9]/g, '')}`
}

export function buildBusinessGenericObject(
  design: Pick<CardDesignInput, 'backgroundColor' | 'cardTitle'>,
  contact: BusinessContact,
  company: BusinessCompany | null,
  ctx: BusinessGoogleContext,
): GenericObject {
  const name = fullName(contact)
  const title = design.cardTitle?.trim() || company?.company || name

  const textModules: GoogleTextModule[] = []
  if (company) textModules.push({ id: 'company', header: 'Firma', body: company.company })
  const address = company
    ? [company.street, [company.postalCode, company.city].filter(Boolean).join(' ')]
        .filter((p): p is string => Boolean(p))
        .join('\n')
    : ''
  if (address) textModules.push({ id: 'address', header: 'Adresse', body: address })

  // Telefon, Mail und Web als Links: Google macht sie antippbar und zeigt sie ganz oben.
  const uris: GoogleLinkModuleUri[] = []
  if (contact.phone) uris.push({ id: 'phone', uri: telUri(contact.phone), description: `Telefon ${contact.phone}` })
  if (contact.mobile) uris.push({ id: 'mobile', uri: telUri(contact.mobile), description: `Mobil ${contact.mobile}` })
  if (company?.phone && company.phone !== contact.phone) {
    uris.push({ id: 'company-phone', uri: telUri(company.phone), description: `Zentrale ${company.phone}` })
  }
  if (contact.email) uris.push({ id: 'email', uri: `mailto:${contact.email}`, description: contact.email })
  if (company?.website) {
    uris.push({ id: 'website', uri: company.website, description: displayUrl(company.website) })
  }
  contact.links.forEach((l, i) => uris.push({ id: `link-${i}`, uri: l.url, description: l.label }))
  uris.push({ id: 'card-privacy', uri: ctx.privacyUrl, description: 'Datenschutz zur Karte' })

  const object: GenericObject = {
    id: businessObjectId(ctx.issuerId, ctx.serial),
    classId: businessClassId(ctx.issuerId, ctx.cardId),
    state: ctx.voided ? 'INACTIVE' : 'ACTIVE',
    cardTitle: text(title),
    header: text(name),
    logo: {
      sourceUri: { uri: ctx.logoUrl },
      contentDescription: text(company?.company ?? name),
    },
    hexBackgroundColor: design.backgroundColor,
    textModulesData: textModules,
    linksModuleData: { uris },
  }

  if (contact.jobTitle) object.subheader = text(contact.jobTitle)

  if (ctx.photoUrl) {
    object.imageModulesData = [
      { id: 'photo', mainImage: { sourceUri: { uri: ctx.photoUrl }, contentDescription: text(name) } },
    ]
  }

  if (ctx.role === 'OWNER' && !ctx.voided) {
    object.barcode = {
      type: 'QR_CODE',
      value: ctx.scanUrl,
      alternateText: 'Scannen für meine Visitenkarte',
    }
  }

  return object
}
