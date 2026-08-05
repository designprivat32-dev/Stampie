import type { CardDesignInput } from './schema'

export const DEFAULT_CARD_DESIGN: CardDesignInput = {
  backgroundColor: '#1a1a1a',
  foregroundColor: '#ffffff',
  labelColor: '#cccccc',
  logoAssetId: null,
  squareLogoAssetId: null,
  iconAssetId: null,
  heroAssetId: null,

  stampGoal: 10,
  stampIcon: 'coffee',
  stampIconAssetId: null,
  emptyStampStyle: 'outline',
  rewardText: '',

  programName: '',
  cardTitle: null,
  stampLabel: 'Stempel',
  backFields: [],

  barcodeFormat: 'QR',
  geoLocations: [],
  expiresAt: null,
  shareable: true,
}

/** Stable-ish id generator for back fields and geo entries (client and server safe). */
export function newFieldId(): string {
  return `f_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`
}
