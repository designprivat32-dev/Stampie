import { toGoogleHex } from '@/lib/color/convert'
import type { CardDesignInput } from './schema'

/**
 * CardDesign -> Google Wallet LoyaltyClass / LoyaltyObject.
 *
 * Mapping (see PLAN.md §11 for the full support matrix):
 *   programName            <- program name
 *   programLogo            <- logo
 *   hexBackgroundColor     <- background colour, HEX here (Apple wants rgb())
 *   heroImage              <- stamp strip at 3:1
 *
 * Google fixes the card layout. `heroImage` renders in the detail area below the barcode
 * and there is no field to move it — only text can be placed around the barcode, and a
 * text stamp row next to the rendered one just showed the same thing twice. The editor
 * preview therefore mirrors Google's real order instead of pretending otherwise.
 *   loyaltyPoints          <- stamp counter
 *   textModulesData[]      <- reward and free-text back fields
 *   linksModuleData[]      <- website, phone, menu
 */

export interface GoogleImageUri {
  sourceUri: { uri: string }
  contentDescription?: { defaultValue: { language: string; value: string } }
}

export interface GoogleTextModule {
  id: string
  header: string
  body: string
}

export interface GoogleLinkModuleUri {
  uri: string
  description: string
  id: string
}

export interface GoogleLatLong {
  latitude: number
  longitude: number
}

export interface LoyaltyClass {
  id: string
  issuerName: string
  programName: string
  reviewStatus: 'UNDER_REVIEW' | 'APPROVED' | 'DRAFT'
  hexBackgroundColor: string
  programLogo?: GoogleImageUri
  heroImage?: GoogleImageUri
  textModulesData?: GoogleTextModule[]
  linksModuleData?: { uris: GoogleLinkModuleUri[] }
  locations?: GoogleLatLong[]
  multipleDevicesAndHoldersAllowedStatus?: 'MULTIPLE_HOLDERS' | 'ONE_USER_ALL_DEVICES' | 'ONE_USER_ONE_DEVICE'
}

export interface LoyaltyObject {
  id: string
  classId: string
  state: 'ACTIVE' | 'EXPIRED' | 'INACTIVE'
  accountId?: string
  accountName?: string
  loyaltyPoints: {
    label: string
    balance: { int: number }
  }
  barcode: {
    type: 'QR_CODE' | 'CODE_128' | 'PDF_417' | 'AZTEC'
    value: string
    alternateText?: string
  }
  heroImage?: GoogleImageUri
  textModulesData?: GoogleTextModule[]
  validTimeInterval?: { end: { date: string } }
}

const BARCODE_MAP = {
  QR: 'QR_CODE',
  CODE128: 'CODE_128',
  PDF417: 'PDF_417',
  AZTEC: 'AZTEC',
} as const

export interface BuildGoogleContext {
  /** Public URL of a generated square logo, used when no logo was uploaded. */
  fallbackLogoUrl?: string
  issuerId: string
  classSuffix: string
  objectSuffix: string
  issuerName: string
  serial: string
  currentStamps: number
  barcodeMessage: string
  logoUrl?: string | null
  /**
   * The rendered stamp row at 3:1 — NOT the uploaded background image. An uploaded
   * background is composited into this render, so it must never be used directly here:
   * doing so drops the stamps from the card entirely.
   */
  heroUrl?: string | null
  customerName?: string | null
}

function image(uri: string, description: string): GoogleImageUri {
  return {
    sourceUri: { uri },
    contentDescription: { defaultValue: { language: 'de', value: description } },
  }
}

export function buildLoyaltyClass(design: CardDesignInput, ctx: BuildGoogleContext): LoyaltyClass {
  const textModules: GoogleTextModule[] = []
  if (design.rewardText.trim()) {
    textModules.push({ id: 'reward', header: 'Belohnung', body: design.rewardText.trim() })
  }
  for (const f of design.backFields) {
    if (f.type === 'url' || f.type === 'phone') continue
    textModules.push({ id: f.id, header: f.label, body: f.value })
  }

  const links: GoogleLinkModuleUri[] = design.backFields
    .filter((f): f is Extract<typeof f, { type: 'url' | 'phone' }> => f.type === 'url' || f.type === 'phone')
    .map((f) => ({
      id: f.id,
      description: f.label,
      uri: f.type === 'phone' ? `tel:${f.value.replace(/[^+0-9]/g, '')}` : f.value,
    }))

  const cls: LoyaltyClass = {
    id: `${ctx.issuerId}.${ctx.classSuffix}`,
    issuerName: ctx.issuerName,
    programName: design.programName.trim() || 'Stempelkarte',
    reviewStatus: 'UNDER_REVIEW',
    hexBackgroundColor: toGoogleHex(design.backgroundColor),
    multipleDevicesAndHoldersAllowedStatus: design.shareable ? 'MULTIPLE_HOLDERS' : 'ONE_USER_ALL_DEVICES',
  }

  // programLogo is REQUIRED by Google — a class without it is rejected with a generic
  // "Something went wrong", so fall back to a generated mark rather than omitting it.
  const logoUrl = ctx.logoUrl ?? ctx.fallbackLogoUrl
  if (logoUrl) cls.programLogo = image(logoUrl, 'Logo')
  if (ctx.heroUrl) cls.heroImage = image(ctx.heroUrl, 'Stempelkarte')
  if (textModules.length > 0) cls.textModulesData = textModules
  if (links.length > 0) cls.linksModuleData = { uris: links }
  if (design.geoLocations.length > 0) {
    cls.locations = design.geoLocations.map((l) => ({ latitude: l.latitude, longitude: l.longitude }))
  }

  return cls
}

export function buildLoyaltyObject(design: CardDesignInput, ctx: BuildGoogleContext): LoyaltyObject {
  const stamps = Math.max(0, Math.min(design.stampGoal, ctx.currentStamps))

  const obj: LoyaltyObject = {
    id: `${ctx.issuerId}.${ctx.objectSuffix}`,
    classId: `${ctx.issuerId}.${ctx.classSuffix}`,
    state: 'ACTIVE',
    accountId: ctx.serial,
    loyaltyPoints: {
      label: design.stampLabel,
      balance: { int: stamps },
    },
    barcode: {
      type: BARCODE_MAP[design.barcodeFormat],
      value: ctx.barcodeMessage,
      alternateText: ctx.serial,
    },
  }

  if (ctx.customerName) obj.accountName = ctx.customerName
  if (ctx.heroUrl) obj.heroImage = image(ctx.heroUrl, 'Stempelkarte')
  if (design.expiresAt) {
    obj.validTimeInterval = { end: { date: design.expiresAt.toISOString() } }
  }

  return obj
}
