export interface OpeningHours {
  /** 1 = Monday … 7 = Sunday (ISO 8601 weekday numbering). */
  weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7
  /** "09:00" */
  opens: string
  /** "18:30" */
  closes: string
}

/** The master data the card designer prefills from. */
export interface LocationSummary {
  id: string
  name: string
  organizationName: string
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

export function formatAddress(location: LocationSummary): string {
  const lines = [location.street, [location.postalCode, location.city].filter(Boolean).join(' ')]
  return lines.filter((l) => l && l.trim().length > 0).join('\n')
}

export function formatOpeningHours(hours: readonly OpeningHours[]): string {
  return hours
    .slice()
    .sort((a, b) => a.weekday - b.weekday)
    .map((h) => `${WEEKDAY_LABELS[h.weekday] ?? '?'} ${h.opens}–${h.closes}`)
    .join('\n')
}
