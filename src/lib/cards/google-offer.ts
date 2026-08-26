import { toGoogleHex } from '@/lib/color/convert'
import { resolveIssuerName } from './issuer'
import type { BuildGoogleContext, GoogleImageUri, GoogleLatLong, GoogleLinkModuleUri, GoogleTextModule } from './google-loyalty'
import { activeGeoLocations, type CardDesignInput } from './schema'

/**
 * CardDesign -> Google Wallet OfferClass / OfferObject, for `CardKind.COUPON`.
 *
 * A coupon is not a loyalty card with the counter removed — it is a different pass type
 * with its own required fields. Google rejects a class missing any of `title`,
 * `redemptionChannel`, `provider`, `issuerName` or `reviewStatus`, so all five are set
 * unconditionally here rather than left to the caller.
 *
 * The one thing the API does *not* offer is a "redeemed" flag. Marking a coupon as used
 * means setting the object's `state` to `expired`, which moves it to the customer's expired
 * passes. Whether it was actually redeemed is ours to record — see `IssuedPass.redeemedAt`.
 */

export interface OfferClass {
  id: string
  issuerName: string
  /** REQUIRED. The offer itself, e.g. "20 % auf alles". */
  title: string
  /** REQUIRED. Merchant or aggregator name shown as the offer's source. */
  provider: string
  /** REQUIRED. Where the coupon may be used. */
  redemptionChannel: 'INSTORE' | 'ONLINE' | 'BOTH'
  reviewStatus: 'UNDER_REVIEW' | 'APPROVED' | 'DRAFT'
  hexBackgroundColor: string
  details?: string
  finePrint?: string
  programLogo?: GoogleImageUri
  heroImage?: GoogleImageUri
  textModulesData?: GoogleTextModule[]
  linksModuleData?: { uris: GoogleLinkModuleUri[] }
  locations?: GoogleLatLong[]
  multipleDevicesAndHoldersAllowedStatus?:
    | 'MULTIPLE_HOLDERS'
    | 'ONE_USER_ALL_DEVICES'
    | 'ONE_USER_ONE_DEVICE'
}

export interface OfferObject {
  id: string
  classId: string
  /** `expired` is how a redeemed coupon is retired — there is no dedicated flag. */
  state: 'ACTIVE' | 'EXPIRED' | 'INACTIVE'
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

function image(uri: string, description: string): GoogleImageUri {
  return {
    sourceUri: { uri },
    contentDescription: { defaultValue: { language: 'de', value: description } },
  }
}

export function buildOfferClass(design: CardDesignInput, ctx: BuildGoogleContext): OfferClass {
  const issuer = resolveIssuerName(design, ctx.issuerName)

  const textModules: GoogleTextModule[] = []
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

  const cls: OfferClass = {
    id: `${ctx.issuerId}.${ctx.classSuffix}`,
    issuerName: issuer,
    // Empty titles are rejected by Google, so an unpublished draft still gets something.
    title: design.offerTitle?.trim() || 'Gutschein',
    // The provider is the shop the customer is dealing with, which is the issuer here.
    provider: issuer,
    redemptionChannel: design.redemptionChannel,
    reviewStatus: 'UNDER_REVIEW',
    hexBackgroundColor: toGoogleHex(design.backgroundColor),
    multipleDevicesAndHoldersAllowedStatus: design.shareable
      ? 'MULTIPLE_HOLDERS'
      : 'ONE_USER_ALL_DEVICES',
  }

  if (design.offerDetails?.trim()) cls.details = design.offerDetails.trim()
  if (design.offerFinePrint?.trim()) cls.finePrint = design.offerFinePrint.trim()

  // programLogo is required for loyalty and expected here too — same fallback rule.
  const logoUrl = ctx.logoUrl ?? ctx.fallbackLogoUrl
  if (logoUrl) cls.programLogo = image(logoUrl, 'Logo')
  // Deliberately no heroImage: `ctx.heroUrl` points at the stamp-strip renderer, which
  // would paint a row of empty stamps across a pass that has no stamps at all.
  if (textModules.length > 0) cls.textModulesData = textModules
  if (links.length > 0) cls.linksModuleData = { uris: links }
  const geoLocations = activeGeoLocations(design)
  if (geoLocations.length > 0) {
    cls.locations = geoLocations.map((l) => ({ latitude: l.latitude, longitude: l.longitude }))
  }

  return cls
}

export interface BuildOfferObjectOptions {
  /** Already redeemed coupons are retired rather than handed out again. */
  redeemed?: boolean
}

export function buildOfferObject(
  design: CardDesignInput,
  ctx: BuildGoogleContext,
  options: BuildOfferObjectOptions = {},
): OfferObject {
  const obj: OfferObject = {
    id: `${ctx.issuerId}.${ctx.objectSuffix}`,
    classId: `${ctx.issuerId}.${ctx.classSuffix}`,
    state: options.redeemed ? 'EXPIRED' : 'ACTIVE',
    barcode: {
      type: BARCODE_MAP[design.barcodeFormat],
      value: ctx.barcodeMessage,
      alternateText: ctx.serial,
    },
  }

  // No heroImage here either — see `buildOfferClass`.
  if (design.expiresAt) {
    obj.validTimeInterval = { end: { date: design.expiresAt.toISOString() } }
  }

  return obj
}
