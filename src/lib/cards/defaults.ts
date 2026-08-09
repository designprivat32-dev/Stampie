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
  issuerDisplayName: null,
  stampLabel: 'Stempel',
  backFields: [],

  // Coupon fields — the card itself for COUPON, the reward for a STAMP card
  rewardCouponEnabled: false,
  offerTitle: null,
  offerDetails: null,
  offerFinePrint: null,
  redemptionChannel: 'INSTORE',

  // Google Wallet optional labels
  accountNameLabel: null,
  accountIdLabel: null,
  rewardsTierLabel: null,
  rewardsTier: null,

  // Google Wallet optional features (disabled by default)
  googleAccountNameEnabled: false,
  googleRewardsTierEnabled: false,

  barcodeFormat: 'QR',
  geoLocations: [],
  expiresAt: null,
  shareable: true,
}

/**
 * True while the draft is still exactly as it was created.
 *
 * The template picker used to open for every *unpublished* card, which meant it greeted the
 * owner on every single visit until they published — long after they had designed the card.
 * "Never published" is the wrong question; "never touched" is the right one.
 */
export function isPristineDesign(design: CardDesignInput): boolean {
  const keys = Object.keys(DEFAULT_CARD_DESIGN) as Array<keyof CardDesignInput>
  return keys.every((key) => {
    const value = design[key]
    const fallback = DEFAULT_CARD_DESIGN[key]
    // Every array default is empty, so length alone settles it.
    if (Array.isArray(fallback)) return Array.isArray(value) && value.length === 0
    return value === fallback
  })
}

/** Stable-ish id generator for back fields and geo entries (client and server safe). */
export function newFieldId(): string {
  return `f_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`
}
