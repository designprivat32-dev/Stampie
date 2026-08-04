/**
 * Which design field actually survives the trip to which wallet. Drives the editor
 * warnings — a shop owner who spends five minutes on the label colour should be told up
 * front that Google Wallet will ignore it.
 */

export type Platform = 'apple' | 'google'
export type SupportLevel = 'full' | 'partial' | 'none'

export interface PlatformSupport {
  readonly apple: SupportLevel
  readonly google: SupportLevel
  /** German note shown next to the control. Empty when both platforms handle it fully. */
  readonly note: string
}

export type SupportedField =
  | 'backgroundColor'
  | 'foregroundColor'
  | 'labelColor'
  | 'logo'
  | 'squareLogo'
  | 'icon'
  | 'hero'
  | 'strip'
  | 'stampCounter'
  | 'rewardText'
  | 'backFields'
  | 'links'
  | 'geoLocations'
  | 'barcodeQr'
  | 'barcodeOther'
  | 'expiresAt'
  | 'shareable'
  | 'cardTitle'

const FULL_BOTH: PlatformSupport = { apple: 'full', google: 'full', note: '' }

export const PLATFORM_SUPPORT: Record<SupportedField, PlatformSupport> = {
  backgroundColor: FULL_BOTH,
  foregroundColor: {
    apple: 'full',
    google: 'none',
    note: 'Nur Apple Wallet — Google Wallet leitet die Textfarbe automatisch aus dem Hintergrund ab.',
  },
  labelColor: {
    apple: 'full',
    google: 'none',
    note: 'Nur Apple Wallet — Google Wallet kennt keine separate Label-Farbe.',
  },
  logo: FULL_BOTH,
  squareLogo: {
    apple: 'none',
    google: 'full',
    note: 'Nur Google Wallet — dort wird das Logo rund beschnitten und braucht deshalb ein quadratisches Bild. Apple Wallet nutzt weiter das breite Logo.',
  },
  icon: {
    apple: 'full',
    google: 'none',
    note: 'Pflicht für Apple Wallet. Google Wallet nutzt stattdessen das Logo.',
  },
  hero: {
    apple: 'partial',
    google: 'full',
    note: 'Google Wallet zeigt das Bild im Verhältnis 3:1, Apple Wallet deutlich schmaler (375×123).',
  },
  strip: {
    apple: 'full',
    google: 'full',
    note: 'Wird für beide Plattformen erzeugt — unterschiedlicher Zuschnitt.',
  },
  stampCounter: FULL_BOTH,
  rewardText: FULL_BOTH,
  backFields: {
    apple: 'full',
    google: 'partial',
    note: 'Apple Wallet zeigt alle Felder auf der Rückseite. Google Wallet kürzt lange Listen.',
  },
  links: FULL_BOTH,
  geoLocations: FULL_BOTH,
  barcodeQr: FULL_BOTH,
  barcodeOther: {
    apple: 'full',
    google: 'partial',
    note: 'PDF417 und Aztec werden von Google Wallet nur eingeschränkt unterstützt.',
  },
  expiresAt: FULL_BOTH,
  shareable: {
    apple: 'full',
    google: 'partial',
    note: 'Apple Wallet unterbindet das Teilen hart, Google Wallet nur eingeschränkt.',
  },
  cardTitle: {
    apple: 'full',
    google: 'partial',
    note: 'Google Wallet zeigt die Überschrift als Teil des Programmnamens.',
  },
}

export function supportFor(field: SupportedField): PlatformSupport {
  return PLATFORM_SUPPORT[field]
}

export function isPlatformLimited(field: SupportedField): boolean {
  const s = PLATFORM_SUPPORT[field]
  return s.apple !== 'full' || s.google !== 'full'
}
