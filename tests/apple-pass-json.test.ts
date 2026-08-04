import { describe, expect, it } from 'vitest'
import { buildPassJson, type BuildPassJsonContext } from '@/lib/cards/apple-pass-json'
import { buildLoyaltyClass, buildLoyaltyObject } from '@/lib/cards/google-loyalty'
import { DEFAULT_CARD_DESIGN } from '@/lib/cards/defaults'
import type { BackField, CardDesignInput, GeoLocation } from '@/lib/cards/schema'

const ctx: BuildPassJsonContext = {
  serial: 'SN-123',
  currentStamps: 6,
  organizationName: 'Café Nord',
  passTypeIdentifier: 'pass.de.stampie.card',
  teamIdentifier: 'ABCDE12345',
  barcodeMessage: 'https://stampie.de/s/SN-123',
}

const design = (over: Partial<CardDesignInput> = {}): CardDesignInput => ({
  ...DEFAULT_CARD_DESIGN,
  programName: 'Kaffeekarte',
  rewardText: 'Jeder 10. Kaffee gratis',
  ...over,
})

describe('buildPassJson', () => {
  it('puts the stamp counter in a header field', () => {
    const p = buildPassJson(design(), ctx)
    expect(p.storeCard.headerFields).toHaveLength(1)
    expect(p.storeCard.headerFields[0]!.value).toBe('6/10')
    expect(p.storeCard.headerFields[0]!.label).toBe('Stempel')
  })

  it('leaves primaryFields empty — storeCard renders them behind the strip', () => {
    expect(buildPassJson(design(), ctx).storeCard.primaryFields).toEqual([])
  })

  it('emits colours as rgb() strings, never hex', () => {
    const p = buildPassJson(design({ backgroundColor: '#3c414c' }), ctx)
    expect(p.backgroundColor).toBe('rgb(60,65,76)')
    expect(p.foregroundColor).toMatch(/^rgb\(\d+,\d+,\d+\)$/)
    expect(p.labelColor).toMatch(/^rgb\(\d+,\d+,\d+\)$/)
    expect(JSON.stringify(p)).not.toContain('#1a1a1a')
  })

  it('always sets messageEncoding to iso-8859-1', () => {
    expect(buildPassJson(design(), ctx).barcode.messageEncoding).toBe('iso-8859-1')
    expect(buildPassJson(design(), ctx).barcodes[0]!.messageEncoding).toBe('iso-8859-1')
  })

  it.each([
    ['QR', 'PKBarcodeFormatQR'],
    ['CODE128', 'PKBarcodeFormatCode128'],
    ['PDF417', 'PKBarcodeFormatPDF417'],
    ['AZTEC', 'PKBarcodeFormatAztec'],
  ] as const)('maps %s -> %s', (input, expected) => {
    expect(buildPassJson(design({ barcodeFormat: input }), ctx).barcode.format).toBe(expected)
  })

  it('respects the secondary/auxiliary field limits', () => {
    const p = buildPassJson(design(), {
      ...ctx,
      customerName: 'Anna Berger',
      memberSince: new Date('2024-03-07T00:00:00Z'),
    })
    expect(p.storeCard.secondaryFields.length).toBeLessThanOrEqual(4)
    expect(p.storeCard.auxiliaryFields.length).toBeLessThanOrEqual(4)
    expect(p.storeCard.headerFields.length).toBeLessThanOrEqual(3)
    expect(p.storeCard.auxiliaryFields.map((f) => f.value)).toContain('07.03.2024')
  })

  it('caps locations at 10 even if more slipped through', () => {
    const geo: GeoLocation[] = Array.from({ length: 14 }, (_, i) => ({
      id: `g${i}`,
      label: `S${i}`,
      latitude: 52,
      longitude: 13,
      maxDistance: 100,
      relevantText: 'Da bist du ja',
    }))
    const p = buildPassJson(design({ geoLocations: geo }), ctx)
    expect(p.locations).toHaveLength(10)
    expect(p.locations![0]!.maxDistance).toBe(100)
  })

  it('omits locations entirely when there are none', () => {
    expect(buildPassJson(design(), ctx).locations).toBeUndefined()
  })

  it('clamps the stamp counter to the goal', () => {
    const p = buildPassJson(design({ stampGoal: 5 }), { ...ctx, currentStamps: 99 })
    expect(p.storeCard.headerFields[0]!.value).toBe('5/5')
  })

  it('maps back fields one-to-one, unlimited', () => {
    const backFields: BackField[] = Array.from({ length: 20 }, (_, i) => ({
      id: `f${i}`,
      type: 'text',
      label: `L${i}`,
      value: `V${i}`,
    }))
    expect(buildPassJson(design({ backFields }), ctx).storeCard.backFields).toHaveLength(20)
  })

  it('sets sharingProhibited only when sharing is off', () => {
    expect(buildPassJson(design({ shareable: true }), ctx).sharingProhibited).toBeUndefined()
    expect(buildPassJson(design({ shareable: false }), ctx).sharingProhibited).toBe(true)
  })

  it('carries the expiry date as ISO 8601', () => {
    const p = buildPassJson(design({ expiresAt: new Date('2027-01-01T00:00:00Z') }), ctx)
    expect(p.expirationDate).toBe('2027-01-01T00:00:00.000Z')
  })
})

describe('google loyalty mapping', () => {
  const gctx = {
    issuerId: '3388000000000000000',
    classSuffix: 'loc_1',
    objectSuffix: 'sn_123',
    issuerName: 'Café Nord',
    serial: 'SN-123',
    currentStamps: 6,
    barcodeMessage: 'https://stampie.de/s/SN-123',
  }

  it('uses hex for the background, not rgb()', () => {
    const cls = buildLoyaltyClass(design({ backgroundColor: '#3c414c' }), gctx)
    expect(cls.hexBackgroundColor).toBe('#3c414c')
  })

  it('routes url and phone fields to linksModuleData, everything else to textModulesData', () => {
    const backFields: BackField[] = [
      { id: 'w', type: 'url', label: 'Website', value: 'https://cafe-nord.de' },
      { id: 't', type: 'phone', label: 'Telefon', value: '+49 30 1234567' },
      { id: 'a', type: 'address', label: 'Adresse', value: 'Hauptstr. 1' },
      { id: 'i', type: 'legal', kind: 'imprint', label: 'Impressum', value: 'https://cafe-nord.de/i' },
    ]
    const cls = buildLoyaltyClass(design({ backFields }), gctx)
    expect(cls.linksModuleData!.uris.map((u) => u.id)).toEqual(['w', 't'])
    expect(cls.linksModuleData!.uris[1]!.uri).toBe('tel:+49301234567')
    expect(cls.textModulesData!.map((t) => t.id)).toEqual(['reward', 'a', 'i'])
  })

  it('maps the stamp counter to loyaltyPoints', () => {
    const obj = buildLoyaltyObject(design({ stampLabel: 'Kaffee' }), gctx)
    expect(obj.loyaltyPoints.label).toBe('Kaffee')
    expect(obj.loyaltyPoints.balance.int).toBe(6)
  })

  it('clamps loyaltyPoints to the goal', () => {
    const obj = buildLoyaltyObject(design({ stampGoal: 5 }), { ...gctx, currentStamps: 42 })
    expect(obj.loyaltyPoints.balance.int).toBe(5)
  })

  it('maps barcode formats to Google names', () => {
    expect(buildLoyaltyObject(design({ barcodeFormat: 'CODE128' }), gctx).barcode.type).toBe('CODE_128')
    expect(buildLoyaltyObject(design({ barcodeFormat: 'PDF417' }), gctx).barcode.type).toBe('PDF_417')
  })

  it('reflects the shareable flag', () => {
    expect(buildLoyaltyClass(design({ shareable: false }), gctx).multipleDevicesAndHoldersAllowedStatus).toBe(
      'ONE_USER_ALL_DEVICES',
    )
  })
})

describe('programLogo is mandatory for Google', () => {
  const gctx = {
    issuerId: '3388000000000000000',
    classSuffix: 'loc_1',
    objectSuffix: 'sn_123',
    issuerName: 'Café Nord',
    serial: 'SN-123',
    currentStamps: 6,
    barcodeMessage: 'https://stampie.de/s/SN-123',
    fallbackLogoUrl: 'https://stampie.de/api/wallet/logo/loc_1',
  }

  // Google rejects a LoyaltyClass without programLogo, and the only feedback the user
  // gets is "Something went wrong" — so this must never regress.
  it('falls back to the generated logo when nothing was uploaded', () => {
    const cls = buildLoyaltyClass(design(), gctx)
    expect(cls.programLogo).toBeDefined()
    expect(cls.programLogo!.sourceUri.uri).toBe('https://stampie.de/api/wallet/logo/loc_1')
  })

  it('prefers an uploaded logo over the fallback', () => {
    const cls = buildLoyaltyClass(design(), { ...gctx, logoUrl: 'https://cdn.example/logo.png' })
    expect(cls.programLogo!.sourceUri.uri).toBe('https://cdn.example/logo.png')
  })
})

describe('heroImage carries the stamp row', () => {
  const gctx = {
    issuerId: '3388000000023179975',
    classSuffix: 'loc_1',
    objectSuffix: 'sn_123',
    issuerName: 'Café Nord',
    serial: 'SN-123',
    currentStamps: 6,
    barcodeMessage: 'https://stampie.de/s/SN-123',
    fallbackLogoUrl: 'https://stampie.de/api/wallet/logo/loc_1',
    heroUrl: 'https://stampie.de/api/wallet/hero/loc_1?s=6',
  }

  // Without heroImage the Google card shows a counter but no stamps at all — the whole
  // point of the card is invisible.
  it('sets heroImage on both class and object', () => {
    expect(buildLoyaltyClass(design(), gctx).heroImage?.sourceUri.uri).toContain('/api/wallet/hero/')
    expect(buildLoyaltyObject(design(), gctx).heroImage?.sourceUri.uri).toContain('/api/wallet/hero/')
  })

  it('encodes the stamp count so a new stamp produces a new URL', () => {
    const six = buildLoyaltyObject(design(), gctx).heroImage!.sourceUri.uri
    const seven = buildLoyaltyObject(design(), {
      ...gctx,
      heroUrl: 'https://stampie.de/api/wallet/hero/loc_1?s=7',
    }).heroImage!.sourceUri.uri
    expect(six).not.toBe(seven)
  })
})

