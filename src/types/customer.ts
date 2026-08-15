export interface OpeningHours {
  /** 1 = Monday … 7 = Sunday (ISO 8601 weekday numbering). */
  weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7
  /** "09:00" */
  opens: string
  /** "18:30" */
  closes: string
}

/**
 * The customer's master data, as the card designer sees it.
 *
 * Everything here is a *prefill source*, never a requirement: the buttons in the designer
 * copy these values into the pass, and a card whose customer has none of them is designed
 * by typing the texts directly.
 */
export interface CustomerSummary {
  /** Null while the card has not been handed to a customer yet. */
  id: string | null
  name: string
  street: string | null
  postalCode: string | null
  city: string | null
  phone: string | null
  website: string | null
  email: string | null
  imprintUrl: string | null
  privacyUrl: string | null
  latitude: number | null
  longitude: number | null
  openingHours: OpeningHours[]
}

const WEEKDAY_LABELS: Record<number, string> = {
  1: 'Mo',
  2: 'Di',
  3: 'Mi',
  4: 'Do',
  5: 'Fr',
  6: 'Sa',
  7: 'So',
}

export function formatAddress(customer: CustomerSummary): string {
  const lines = [customer.street, [customer.postalCode, customer.city].filter(Boolean).join(' ')]
  return lines.filter((l) => l && l.trim().length > 0).join('\n')
}

export function formatOpeningHours(hours: readonly OpeningHours[]): string {
  return hours
    .slice()
    .sort((a, b) => a.weekday - b.weekday)
    .map((h) => `${WEEKDAY_LABELS[h.weekday] ?? '?'} ${h.opens}–${h.closes}`)
    .join('\n')
}
