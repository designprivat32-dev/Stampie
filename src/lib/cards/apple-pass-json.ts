import { toPassKitRgb } from '@/lib/color/convert'
import { resolveIssuerName } from './issuer'
import {
  MAX_AUXILIARY_FIELDS,
  MAX_GEO_LOCATIONS,
  MAX_HEADER_FIELDS,
  MAX_SECONDARY_FIELDS,
  type BarcodeFormat,
  type CardDesignInput,
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
  storeCard: StoreCardStructure
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
}

/**
 * Builds the pass.json body. Signing, manifest and bundling are the PassBuilder's job.
 * Every array is hard-capped here as well as in the Zod schema — the editor should never
 * produce an over-long list, but a malformed pass is silently rejected by Wallet and that
 * is a terrible way to find out.
 */
export function buildPassJson(design: CardDesignInput, ctx: BuildPassJsonContext): PassJson {
  const stamps = Math.max(0, Math.min(design.stampGoal, ctx.currentStamps))

  const headerFields: PassField[] = (
    [
      {
        key: 'stamps',
        label: design.stampLabel,
        value: `${stamps}/${design.stampGoal}`,
        textAlignment: 'PKTextAlignmentRight',
      },
    ] satisfies PassField[]
  ).slice(0, MAX_HEADER_FIELDS)

  const secondaryFields: PassField[] = []
  if (design.rewardText.trim()) {
    secondaryFields.push({ key: 'reward', label: 'Belohnung', value: design.rewardText.trim() })
  }
  if (design.programName.trim()) {
    secondaryFields.push({ key: 'program', label: 'Programm', value: design.programName.trim() })
  }

  const auxiliaryFields: PassField[] = []
  if (ctx.customerName) {
    auxiliaryFields.push({ key: 'customer', label: 'Kunde', value: ctx.customerName })
  }
  if (ctx.memberSince) {
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

  const barcode: PassBarcode = {
    format: toPassKitBarcodeFormat(design.barcodeFormat),
    message: ctx.barcodeMessage,
    messageEncoding: 'iso-8859-1',
    altText: ctx.serial,
  }

  const pass: PassJson = {
    formatVersion: 1,
    passTypeIdentifier: ctx.passTypeIdentifier,
    teamIdentifier: ctx.teamIdentifier,
    // Apple shows this on lock-screen notifications, so it follows the same override.
    organizationName: resolveIssuerName(design, ctx.organizationName),
    serialNumber: ctx.serial,
    description: design.programName.trim() || 'Stempelkarte',
    backgroundColor: toPassKitRgb(design.backgroundColor),
    foregroundColor: toPassKitRgb(design.foregroundColor),
    labelColor: toPassKitRgb(design.labelColor),
    barcode,
    barcodes: [barcode],
    storeCard: {
      headerFields,
      // storeCard renders primaryFields behind the strip image — leave it empty so the
      // stamp grid stays readable.
      primaryFields: [],
      secondaryFields: secondaryFields.slice(0, MAX_SECONDARY_FIELDS),
      auxiliaryFields: auxiliaryFields.slice(0, MAX_AUXILIARY_FIELDS),
      backFields,
    },
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
