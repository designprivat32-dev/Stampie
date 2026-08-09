import { toPassKitRgb } from '@/lib/color/convert'
import { resolveIssuerName } from './issuer'
import {
  MAX_AUXILIARY_FIELDS,
  MAX_GEO_LOCATIONS,
  MAX_HEADER_FIELDS,
  MAX_SECONDARY_FIELDS,
  type BarcodeFormat,
  type CardDesignInput,
  type CardKind,
} from './schema'

/**
 * CardDesign -> pass.json for a `storeCard`.
 *
 * Field-area budget (PassKit, storeCard):
 *   headerFields     max 3, very narrow  -> stamp counter "6/10"
 *   primaryFields    1, sits behind the strip -> intentionally left empty
 *   secondaryFields  max 4               -> reward, program name
 *   auxiliaryFields  max 4               -> customer name, member since
 *   backFields       unlimited           -> address, hours, contact, legal
 */

export interface PassField {
  key: string
  label?: string
  value: string
  textAlignment?: 'PKTextAlignmentLeft' | 'PKTextAlignmentCenter' | 'PKTextAlignmentRight' | 'PKTextAlignmentNatural'
  attributedValue?: string
}

export interface PassBarcode {
  format: 'PKBarcodeFormatQR' | 'PKBarcodeFormatCode128' | 'PKBarcodeFormatPDF417' | 'PKBarcodeFormatAztec'
  message: string
  /** Apple requires iso-8859-1 here. */
  messageEncoding: 'iso-8859-1'
  altText?: string
}

export interface PassLocation {
  latitude: number
  longitude: number
  relevantText?: string
  maxDistance?: number
}

/** Same shape for both styles we emit — only the key it sits under differs. */
export interface StoreCardStructure {
  headerFields: PassField[]
  primaryFields: PassField[]
  secondaryFields: PassField[]
  auxiliaryFields: PassField[]
  backFields: PassField[]
}

export interface PassJson {
  formatVersion: 1
  passTypeIdentifier: string
  teamIdentifier: string
  organizationName: string
  serialNumber: string
  description: string
  backgroundColor: string
  foregroundColor: string
  labelColor: string
  barcode: PassBarcode
  barcodes: PassBarcode[]
  /**
   * Exactly one of these is set — the key *is* the pass style, and Wallet picks the layout
   * from it. `storeCard` puts the strip image behind the primary field, which is what a
   * stamp row needs; `coupon` is the style Apple intends for a single-use offer.
   */
  storeCard?: StoreCardStructure
  coupon?: StoreCardStructure
  locations?: PassLocation[]
  maxDistance?: number
  expirationDate?: string
  sharingProhibited?: boolean
  logoText?: string
}

const BARCODE_MAP: Record<BarcodeFormat, PassBarcode['format']> = {
  QR: 'PKBarcodeFormatQR',
  CODE128: 'PKBarcodeFormatCode128',
  PDF417: 'PKBarcodeFormatPDF417',
  AZTEC: 'PKBarcodeFormatAztec',
}

export function toPassKitBarcodeFormat(format: BarcodeFormat): PassBarcode['format'] {
  return BARCODE_MAP[format]
}

export interface BuildPassJsonContext {
  serial: string
  currentStamps: number
  organizationName: string
  passTypeIdentifier: string
  teamIdentifier: string
  /** Payload behind the barcode — the stamping URL. */
  barcodeMessage: string
  customerName?: string | null
  memberSince?: Date | null
  /** Defaults to the stamp card so existing callers keep their behaviour. */
  kind?: CardKind
}

/**
 * Builds the pass.json body. Signing, manifest and bundling are the PassBuilder's job.
 * Every array is hard-capped here as well as in the Zod schema — the editor should never
 * produce an over-long list, but a malformed pass is silently rejected by Wallet and that
 * is a terrible way to find out.
 */
export function buildPassJson(design: CardDesignInput, ctx: BuildPassJsonContext): PassJson {
  const kind: CardKind = ctx.kind ?? 'STAMP'
  const isCoupon = kind === 'COUPON'
  const stamps = Math.max(0, Math.min(design.stampGoal, ctx.currentStamps))

  // A coupon has no counter, so its header stays empty rather than showing "0/10".
  const headerFields: PassField[] = isCoupon
    ? []
    : (
        [
          {
            key: 'stamps',
            label: design.stampLabel,
            value: `${stamps}/${design.stampGoal}`,
            textAlignment: 'PKTextAlignmentRight',
          },
        ] satisfies PassField[]
      ).slice(0, MAX_HEADER_FIELDS)

  // The offer itself belongs in primaryFields — on a coupon that is the line Wallet sets
  // in the largest type. A storeCard hides primaryFields behind the strip, so it stays
  // empty there and the stamp grid keeps the space.
  const primaryFields: PassField[] =
    isCoupon && design.offerTitle?.trim()
      ? [{ key: 'offer', value: design.offerTitle.trim() }]
      : []

  const secondaryFields: PassField[] = []
  if (isCoupon) {
    if (design.offerDetails?.trim()) {
      secondaryFields.push({ key: 'details', value: design.offerDetails.trim() })
    }
  } else {
    if (design.rewardText.trim()) {
      secondaryFields.push({ key: 'reward', label: 'Belohnung', value: design.rewardText.trim() })
    }
    if (design.programName.trim()) {
      secondaryFields.push({ key: 'program', label: 'Programm', value: design.programName.trim() })
    }
  }

  const auxiliaryFields: PassField[] = []
  if (ctx.customerName) {
    auxiliaryFields.push({ key: 'customer', label: 'Kunde', value: ctx.customerName })
  }
  if (ctx.memberSince && !isCoupon) {
    auxiliaryFields.push({
      key: 'member-since',
      label: 'Mitglied seit',
      value: formatGermanDate(ctx.memberSince),
    })
  }

  const backFields: PassField[] = design.backFields.map((f) => ({
    key: f.id,
    label: f.label,
    value: f.value,
  }))

  // Fine print is a legal term of the offer — it goes on the back, above the shop's own
  // fields, because that is where a customer looks for the conditions.
  if (isCoupon && design.offerFinePrint?.trim()) {
    backFields.unshift({
      key: 'fine-print',
      label: 'Einlösebedingungen',
      value: design.offerFinePrint.trim(),
    })
  }

  const barcode: PassBarcode = {
    format: toPassKitBarcodeFormat(design.barcodeFormat),
    message: ctx.barcodeMessage,
    messageEncoding: 'iso-8859-1',
    altText: ctx.serial,
  }

  const structure: StoreCardStructure = {
    headerFields,
    primaryFields,
    secondaryFields: secondaryFields.slice(0, MAX_SECONDARY_FIELDS),
    auxiliaryFields: auxiliaryFields.slice(0, MAX_AUXILIARY_FIELDS),
    backFields,
  }

  const fallbackDescription = isCoupon ? 'Gutschein' : 'Stempelkarte'

  const pass: PassJson = {
    formatVersion: 1,
    passTypeIdentifier: ctx.passTypeIdentifier,
    teamIdentifier: ctx.teamIdentifier,
    // Apple shows this on lock-screen notifications, so it follows the same override.
    organizationName: resolveIssuerName(design, ctx.organizationName),
    serialNumber: ctx.serial,
    description:
      (isCoupon ? design.offerTitle?.trim() : design.programName.trim()) || fallbackDescription,
    backgroundColor: toPassKitRgb(design.backgroundColor),
    foregroundColor: toPassKitRgb(design.foregroundColor),
    labelColor: toPassKitRgb(design.labelColor),
    barcode,
    barcodes: [barcode],
    // The style key decides the layout, so exactly one of the two is ever present.
    ...(isCoupon ? { coupon: structure } : { storeCard: structure }),
  }

  if (design.cardTitle?.trim()) {
    pass.logoText = design.cardTitle.trim()
  }

  if (design.geoLocations.length > 0) {
    pass.locations = design.geoLocations.slice(0, MAX_GEO_LOCATIONS).map((l) => ({
      latitude: l.latitude,
      longitude: l.longitude,
      relevantText: l.relevantText || undefined,
      maxDistance: l.maxDistance,
    }))
  }

  if (design.expiresAt) {
    pass.expirationDate = design.expiresAt.toISOString()
  }

  if (!design.shareable) {
    pass.sharingProhibited = true
  }

  return pass
}

function formatGermanDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}
