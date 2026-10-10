import { toPassKitRgb } from '@/lib/color/convert'
import type { PassBarcode, PassField } from '@/lib/cards/apple-pass-json'
import type { CardDesignInput } from '@/lib/cards/schema'
import type { BusinessCompany, BusinessContact } from './schema'

/**
 * Visitenkarte -> pass.json im Stil `generic`.
 *
 * Eigene Datei statt einer weiteren Weiche in `lib/cards/apple-pass-json.ts`: die Stempel-
 * und Gutschein-Pässe bleiben damit Byte für Byte, wie sie sind (siehe
 * `tests/card-kind-guard.test.ts`).
 *
 * Aufteilung (PassKit, generic):
 *   primaryFields    Name — die größte Zeile auf der Karte
 *   secondaryFields  Position, Firma
 *   auxiliaryFields  Telefon, E-Mail
 *   backFields       alle Kontaktwege, Adresse, Links, Datenschutz
 *
 * Zwei Rollen aus denselben Daten: der Aussteller-Pass trägt den QR-Code zur Scan-Seite,
 * der Empfänger-Pass keinen — weitergeben ist ausdrücklich nicht gewollt.
 */

export type BusinessPassRole = 'OWNER' | 'HOLDER'

export interface GenericStructure {
  headerFields: PassField[]
  primaryFields: PassField[]
  secondaryFields: PassField[]
  auxiliaryFields: PassField[]
  backFields: PassField[]
}

export interface BusinessPassJson {
  formatVersion: 1
  passTypeIdentifier: string
  teamIdentifier: string
  organizationName: string
  serialNumber: string
  description: string
  backgroundColor: string
  foregroundColor: string
  labelColor: string
  generic: GenericStructure
  logoText?: string
  /** Nur am Aussteller-Pass. Fehlt der Schlüssel, zeigt Wallet keinen Code. */
  barcode?: PassBarcode
  barcodes?: PassBarcode[]
  sharingProhibited?: boolean
  /** Person gelöscht: Wallet zeigt die Karte als ungültig an. */
  voided?: boolean
  webServiceURL?: string
  authenticationToken?: string
}

export interface BuildBusinessPassContext {
  role: BusinessPassRole
  serial: string
  passTypeIdentifier: string
  teamIdentifier: string
  /** `<app>/v/<scanCode>` — Ziel des QR-Codes am Aussteller-Pass. */
  scanUrl: string
  /** Was der Pass speichert; steht auf jedem Pass. */
  privacyUrl: string
  webService?: { url: string; authenticationToken: string } | null
  /** Die Person wurde gelöscht — Karte entwerten, Code entfernen. */
  voided?: boolean
}

type DesignColors = Pick<
  CardDesignInput,
  'backgroundColor' | 'foregroundColor' | 'labelColor' | 'cardTitle'
>

export function fullName(contact: Pick<BusinessContact, 'firstName' | 'lastName'>): string {
  return `${contact.firstName} ${contact.lastName}`.trim()
}

function link(url: string, text: string): string {
  return `<a href="${escapeHtml(url)}">${escapeHtml(text)}</a>`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Anzeige einer URL ohne `https://` und abschließenden Schrägstrich. */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '')
}

function formatAddress(company: BusinessCompany): string | null {
  const cityLine = [company.postalCode, company.city].filter(Boolean).join(' ')
  const parts = [company.street, cityLine].filter((p): p is string => Boolean(p))
  return parts.length > 0 ? parts.join('\n') : null
}

function backFields(
  contact: BusinessContact,
  company: BusinessCompany | null,
  ctx: BuildBusinessPassContext,
): PassField[] {
  const fields: PassField[] = []
  // Telefonnummern und E-Mail erkennt Wallet selbst und macht sie antippbar; ein
  // attributedValue mit `tel:` wird nicht überall dargestellt und bringt hier nichts.
  if (contact.phone) fields.push({ key: 'phone', label: 'Telefon', value: contact.phone })
  if (contact.mobile) fields.push({ key: 'mobile', label: 'Mobil', value: contact.mobile })
  if (company?.phone && company.phone !== contact.phone) {
    fields.push({ key: 'company-phone', label: 'Zentrale', value: company.phone })
  }
  if (contact.email) fields.push({ key: 'email', label: 'E-Mail', value: contact.email })
  if (company?.website) {
    fields.push({
      key: 'website',
      label: 'Web',
      value: company.website,
      attributedValue: link(company.website, displayUrl(company.website)),
    })
  }
  const address = company ? formatAddress(company) : null
  if (address) fields.push({ key: 'address', label: 'Adresse', value: address })

  contact.links.forEach((l, i) => {
    fields.push({
      key: `link-${i}`,
      label: l.label,
      value: l.url,
      attributedValue: link(l.url, displayUrl(l.url)),
    })
  })

  fields.push({
    key: 'card-privacy',
    label: 'Datenschutz zur Karte',
    value: ctx.privacyUrl,
    attributedValue: link(ctx.privacyUrl, 'Was diese Karte speichert'),
  })
  return fields
}

export function buildBusinessPassJson(
  design: DesignColors,
  contact: BusinessContact,
  company: BusinessCompany | null,
  ctx: BuildBusinessPassContext,
): BusinessPassJson {
  const name = fullName(contact)

  const secondaryFields: PassField[] = []
  if (contact.jobTitle) secondaryFields.push({ key: 'title', label: 'Position', value: contact.jobTitle })
  if (company) secondaryFields.push({ key: 'company', label: 'Firma', value: company.company })

  const auxiliaryFields: PassField[] = []
  const phone = contact.mobile ?? contact.phone ?? company?.phone ?? null
  if (phone) auxiliaryFields.push({ key: 'front-phone', label: 'Telefon', value: phone })
  if (contact.email) auxiliaryFields.push({ key: 'front-email', label: 'E-Mail', value: contact.email })

  const pass: BusinessPassJson = {
    formatVersion: 1,
    passTypeIdentifier: ctx.passTypeIdentifier,
    teamIdentifier: ctx.teamIdentifier,
    // Steht auf dem Sperrbildschirm und in der Wallet-Liste.
    organizationName: company?.company ?? name,
    serialNumber: ctx.serial,
    description: `Visitenkarte ${name}`,
    backgroundColor: toPassKitRgb(design.backgroundColor),
    foregroundColor: toPassKitRgb(design.foregroundColor),
    labelColor: toPassKitRgb(design.labelColor),
    generic: {
      headerFields: [],
      primaryFields: [{ key: 'name', label: 'Visitenkarte', value: name }],
      secondaryFields: secondaryFields.slice(0, 4),
      auxiliaryFields: auxiliaryFields.slice(0, 4),
      backFields: backFields(contact, company, ctx),
    },
  }

  const title = design.cardTitle?.trim() || company?.company
  if (title) pass.logoText = title

  if (ctx.voided) {
    pass.voided = true
    pass.generic.backFields.unshift({
      key: 'voided',
      label: 'Hinweis',
      value: 'Diese Visitenkarte ist nicht mehr gültig.',
    })
  } else if (ctx.role === 'OWNER') {
    const barcode: PassBarcode = {
      format: 'PKBarcodeFormatQR',
      message: ctx.scanUrl,
      messageEncoding: 'iso-8859-1',
      altText: 'Scannen für meine Visitenkarte',
    }
    pass.barcode = barcode
    pass.barcodes = [barcode]
  }

  // Keine Weitergabe aus Wallet heraus, für beide Rollen: der Aussteller-Pass mit QR-Code
  // gehört der Person selbst, und Empfänger sollen die Karte nicht weiterreichen — wer sie
  // haben will, scannt den Code und bekommt seinen eigenen Pass.
  pass.sharingProhibited = true

  if (ctx.webService) {
    pass.webServiceURL = ctx.webService.url
    pass.authenticationToken = ctx.webService.authenticationToken
  }

  return pass
}
