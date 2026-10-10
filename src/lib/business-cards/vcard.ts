import type { BusinessCompany, BusinessContact } from './schema'

/**
 * vCard 3.0 für „Kontakt speichern" auf der Scan-Seite.
 *
 * 3.0 statt 4.0, weil iOS und Android beide 3.0 zuverlässig ins Adressbuch übernehmen;
 * 4.0 wird von älteren Android-Kontakte-Apps teils nur halb gelesen. Zeichensatz ist UTF-8,
 * das sagt der Content-Type der Antwort — ein `CHARSET=`-Parameter je Zeile ist 2.1-Stil
 * und bringt manche Importer eher durcheinander.
 */

const CRLF = '\r\n'
/** RFC 2425: Zeilen über 75 Oktette werden umbrochen. */
const MAX_LINE_OCTETS = 75

export interface VCardInput {
  contact: BusinessContact
  company: BusinessCompany | null
  /** Foto als PNG; landet eingebettet im Kontakt. */
  photoPng?: Buffer | null
}

/** Maskiert, was in einem vCard-Wert eine Bedeutung hat: `\`, `,`, `;` und Zeilenumbrüche. */
export function escapeVCardValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

/**
 * Bricht eine Zeile nach 75 Oktetten um (CRLF + Leerzeichen). Gezählt wird in UTF-8-Bytes,
 * geschnitten aber nur zwischen Zeichen — ein halbes „ü" am Zeilenende macht den ganzen
 * Kontakt unlesbar.
 */
export function foldVCardLine(line: string): string {
  const encoder = new TextEncoder()
  const parts: string[] = []
  let current = ''
  let currentBytes = 0
  // Folgezeilen beginnen mit einem Leerzeichen, das mitzählt.
  let limit = MAX_LINE_OCTETS

  for (const char of line) {
    const bytes = encoder.encode(char).length
    if (currentBytes + bytes > limit) {
      parts.push(current)
      current = ''
      currentBytes = 0
      limit = MAX_LINE_OCTETS - 1
    }
    current += char
    currentBytes += bytes
  }
  parts.push(current)
  return parts.join(`${CRLF} `)
}

function fullName(contact: BusinessContact): string {
  return `${contact.firstName} ${contact.lastName}`.trim()
}

export function buildVCard({ contact, company, photoPng }: VCardInput): string {
  const e = escapeVCardValue
  const lines: string[] = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${e(contact.lastName)};${e(contact.firstName)};;;`,
    `FN:${e(fullName(contact))}`,
  ]

  if (company) lines.push(`ORG:${e(company.company)}`)
  if (contact.jobTitle) lines.push(`TITLE:${e(contact.jobTitle)}`)
  if (contact.phone) lines.push(`TEL;TYPE=WORK,VOICE:${e(contact.phone)}`)
  if (contact.mobile) lines.push(`TEL;TYPE=CELL:${e(contact.mobile)}`)
  // Die Zentrale nur, wenn die Person keine eigene Durchwahl hat — zwei Nummern mit
  // demselben Etikett lassen den Empfänger raten, welche die richtige ist.
  if (company?.phone && !contact.phone) lines.push(`TEL;TYPE=WORK,VOICE:${e(company.phone)}`)
  if (contact.email) lines.push(`EMAIL;TYPE=INTERNET,WORK:${e(contact.email)}`)
  if (company?.website) lines.push(`URL;TYPE=WORK:${e(company.website)}`)

  if (company && (company.street || company.city || company.postalCode)) {
    // ADR: Postfach;Adresszusatz;Straße;Ort;Region;PLZ;Land
    lines.push(
      `ADR;TYPE=WORK:;;${e(company.street ?? '')};${e(company.city ?? '')};;${e(company.postalCode ?? '')};`,
    )
  }

  // Gruppierte URL mit Etikett — Apple-Kontakte zeigen dann „LinkedIn" statt „Startseite".
  contact.links.forEach((link, i) => {
    const item = `item${i + 1}`
    lines.push(`${item}.URL:${e(link.url)}`)
    lines.push(`${item}.X-ABLabel:${e(link.label)}`)
  })

  // Eingebettet statt verlinkt: iOS und Android laden kein Foto von einer Adresse nach.
  if (photoPng && photoPng.length > 0) {
    lines.push(`PHOTO;ENCODING=b;TYPE=PNG:${photoPng.toString('base64')}`)
  }

  lines.push('END:VCARD')
  return lines.map(foldVCardLine).join(CRLF) + CRLF
}

/** Dateiname für den Download: ASCII, damit kein Browser ihn verstümmelt. */
export function vCardFileName(contact: BusinessContact): string {
  const base = fullName(contact)
    .normalize('NFKD')
    .replace(/ß/g, 'ss')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${base || 'kontakt'}.vcf`
}
