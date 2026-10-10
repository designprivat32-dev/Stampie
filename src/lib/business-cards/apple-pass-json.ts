import { toPassKitRgb } from '@/lib/color/convert'
import type { PassField } from '@/lib/cards/apple-pass-json'
import type { CardDesignInput } from '@/lib/cards/schema'
import type { BusinessCompany, BusinessContact } from './schema'
import { buildCompactVCard } from './vcard'

/**
 * Visitenkarte -> pass.json im Stil `storeCard`.
 *
 * Eigene Datei statt einer weiteren Weiche in `lib/cards/apple-pass-json.ts`: die Stempel-
 * und Gutschein-Pässe bleiben damit Byte für Byte, wie sie sind (siehe
 * `tests/card-kind-guard.test.ts`).
 *
 * `storeCard` statt `generic`, weil Apple jede Karte gleich hoch zeichnet: im `generic`-Stil
 * blieb unter den Feldern eine große leere Fläche. Der Store-Card-Stil hat oben ein breites
 * Bannerbild (`strip.png`, siehe `render-strip.ts`), das den Platz füllt.
 *
 * Aufteilung (PassKit, storeCard):
 *   primaryFields    Name — groß über dem Banner
 *   secondaryFields  Position, Telefon, E-Mail
 *   backFields       alle Kontaktwege, Adresse, Links, Datenschutz
 *
 * Unten der Code, je nach Rolle:
 *   Aussteller  QR zur Scan-Seite — wer ihn scannt, bekommt die Karte ins Wallet.
 *   Empfänger   QR mit den Kontaktdaten selbst (vCard) — scannen = Kontakt speichern. Er
 *               führt nicht zur Scan-Seite, die Wallet-Karte lässt sich also nicht weitergeben.
 */

export type BusinessPassRole = 'OWNER' | 'HOLDER'

/**
 * Eigener Barcode-Typ, weil der Empfänger-Code Umlaute trägt: Apple kodiert die Nachricht
 * im angegebenen Zeichensatz, und UTF-8 ist das, was Kameras bei einer vCard erwarten.
 */
export interface BusinessBarcode {
  format: 'PKBarcodeFormatQR'
  message: string
  messageEncoding: 'iso-8859-1' | 'utf-8'
  altText?: string
}

export interface StoreCardStructure {
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
  storeCard: StoreCardStructure
  logoText?: string
  /** Fehlt nur bei einer entwerteten Karte. */
  barcode?: BusinessBarcode
  barcodes?: BusinessBarcode[]
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

  // Firma steht oben als Titel; hier, was man auf einen Blick braucht.
  const secondaryFields: PassField[] = []
  if (contact.jobTitle) secondaryFields.push({ key: 'title', label: 'Position', value: contact.jobTitle })
  const phone = contact.mobile ?? contact.phone ?? company?.phone ?? null
  if (phone) secondaryFields.push({ key: 'front-phone', label: 'Telefon', value: phone })
  if (contact.email) secondaryFields.push({ key: 'front-email', label: 'E-Mail', value: contact.email })

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
    storeCard: {
      headerFields: [],
      primaryFields: [{ key: 'name', value: name }],
      // Store Card erlaubt höchstens vier Felder in der Zeile unter dem Banner.
      secondaryFields: secondaryFields.slice(0, 4),
      auxiliaryFields: [],
      backFields: backFields(contact, company, ctx),
    },
  }

  const title = design.cardTitle?.trim() || company?.company
  if (title) pass.logoText = title

  if (ctx.voided) {
    pass.voided = true
    pass.storeCard.backFields.unshift({
      key: 'voided',
      label: 'Hinweis',
      value: 'Diese Visitenkarte ist nicht mehr gültig.',
    })
  } else {
    const barcode: BusinessBarcode =
      ctx.role === 'OWNER'
        ? {
            format: 'PKBarcodeFormatQR',
            message: ctx.scanUrl,
            messageEncoding: 'iso-8859-1',
            altText: 'Scannen für meine Visitenkarte',
          }
        : {
            format: 'PKBarcodeFormatQR',
            message: buildCompactVCard({ contact, company }),
            messageEncoding: 'utf-8',
            altText: 'Scannen, um den Kontakt zu speichern',
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
