import { appUrl } from '@/lib/app-url'
import { parseStoredLinks, type BusinessCompany, type BusinessContact } from './schema'

/**
 * Datenbankzeile -> die Formen, mit denen Pass und vCard arbeiten.
 *
 * Die Zeilen wurden beim Speichern schon durch die Zod-Schemas geprüft; hier wird nur noch
 * umgeformt. Einzige Ausnahme sind die Links: JSON-Spalte, also bei jedem Lesen geprüft.
 */

export interface ContactRow {
  firstName: string
  lastName: string
  jobTitle: string | null
  phone: string | null
  mobile: string | null
  email: string | null
  links: unknown
}

export interface CompanyRow {
  company: string
  website: string | null
  phone: string | null
  street: string | null
  postalCode: string | null
  city: string | null
}

export function toBusinessContact(row: ContactRow): BusinessContact {
  return {
    firstName: row.firstName,
    lastName: row.lastName,
    jobTitle: row.jobTitle,
    phone: row.phone,
    mobile: row.mobile,
    email: row.email,
    links: parseStoredLinks(row.links),
  }
}

export function toBusinessCompany(row: CompanyRow | null): BusinessCompany | null {
  if (!row) return null
  return {
    company: row.company,
    website: row.website,
    phone: row.phone,
    street: row.street,
    postalCode: row.postalCode,
    city: row.city,
  }
}

/** Ziel des QR-Codes auf dem Aussteller-Pass. */
export function scanUrlFor(scanCode: string): string {
  return `${appUrl()}/v/${scanCode}`
}

export function privacyUrlFor(scanCode: string): string {
  return `${scanUrlFor(scanCode)}/datenschutz`
}
