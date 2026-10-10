import { z } from 'zod'

/**
 * Eingaben für die digitale Visitenkarte (PLAN-VISITENKARTEN.md).
 *
 * Alles, was hier durchkommt, landet auf einem Wallet-Pass und in einer vCard — beides
 * Formate, die ein kaputtes Feld nicht melden, sondern still verwerfen. Deshalb wird hart
 * geprüft und weich normalisiert: Leerzeichen weg, leere Felder werden null, eine Webadresse
 * ohne `https://` bekommt es vorangestellt, statt den Nutzer daran scheitern zu lassen.
 */

export const MAX_CONTACT_LINKS = 5

/** Leerer Text heißt „nicht angegeben", nicht „leer anzeigen". */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Höchstens ${max} Zeichen.`)
    .transform((v) => (v === '' ? null : v))
    .nullish()
    .transform((v) => v ?? null)

const requiredText = (max: number, message: string) =>
  z.string().trim().min(1, message).max(max, `Höchstens ${max} Zeichen.`)

const PHONE_PATTERN = /^[+0-9 ()/-]{5,40}$/

const optionalPhone = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v))
  .nullish()
  .transform((v) => v ?? null)
  .refine((v) => v === null || PHONE_PATTERN.test(v), 'Bitte eine gültige Telefonnummer angeben.')

const optionalEmail = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v.toLowerCase()))
  .nullish()
  .transform((v) => v ?? null)
  .refine(
    (v) => v === null || z.string().email().max(254).safeParse(v).success,
    'Bitte eine gültige E-Mail-Adresse angeben.',
  )

/**
 * Ergänzt ein fehlendes `https://` und lässt nur http(s) durch. Ein `javascript:`-Link auf
 * einem Pass wäre antippbar — genau das darf nicht durchrutschen.
 */
export function normalizeWebUrl(input: string): string | null {
  const trimmed = input.trim()
  if (trimmed === '') return null
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(withScheme)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (!url.hostname.includes('.')) return null
    return url.toString()
  } catch {
    return null
  }
}

const requiredUrl = z
  .string()
  .max(500, 'Adresse ist zu lang.')
  .transform((v, ctx) => {
    const url = normalizeWebUrl(v)
    if (!url) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Bitte eine gültige Webadresse angeben.' })
      return z.NEVER
    }
    return url
  })

const optionalUrl = z
  .string()
  .max(500, 'Adresse ist zu lang.')
  .nullish()
  .transform((v, ctx) => {
    if (v == null || v.trim() === '') return null
    const url = normalizeWebUrl(v)
    if (!url) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Bitte eine gültige Webadresse angeben.' })
      return z.NEVER
    }
    return url
  })

export const contactLinkSchema = z.object({
  label: requiredText(40, 'Bitte eine Bezeichnung angeben, z. B. LinkedIn.'),
  url: requiredUrl,
})
export type ContactLink = z.infer<typeof contactLinkSchema>

export const businessCompanySchema = z.object({
  company: requiredText(120, 'Bitte den Firmennamen angeben.'),
  website: optionalUrl,
  phone: optionalPhone,
  street: optionalText(120),
  postalCode: optionalText(12),
  city: optionalText(80),
})
export type BusinessCompanyInput = z.input<typeof businessCompanySchema>
export type BusinessCompany = z.output<typeof businessCompanySchema>

export const businessContactSchema = z.object({
  firstName: requiredText(80, 'Bitte den Vornamen angeben.'),
  lastName: requiredText(80, 'Bitte den Nachnamen angeben.'),
  jobTitle: optionalText(120),
  phone: optionalPhone,
  mobile: optionalPhone,
  email: optionalEmail,
  links: z
    .array(contactLinkSchema)
    .max(MAX_CONTACT_LINKS, `Höchstens ${MAX_CONTACT_LINKS} Links.`)
    .default([]),
})
export type BusinessContactInput = z.input<typeof businessContactSchema>
export type BusinessContact = z.output<typeof businessContactSchema>

/**
 * Liest `BusinessContact.links` aus der Datenbank. Die Spalte ist JSON und damit nicht
 * typgeprüft; was nicht passt, fällt weg, statt den ganzen Pass zu verhindern.
 */
export function parseStoredLinks(value: unknown): ContactLink[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const parsed = contactLinkSchema.safeParse(item)
    return parsed.success ? [parsed.data] : []
  }).slice(0, MAX_CONTACT_LINKS)
}
