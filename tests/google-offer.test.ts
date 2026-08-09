import { describe, expect, it } from 'vitest'
import { buildOfferClass, buildOfferObject } from '@/lib/cards/google-offer'
import { DEFAULT_CARD_DESIGN } from '@/lib/cards/defaults'
import type { BackField, CardDesignInput } from '@/lib/cards/schema'

const ctx = {
  issuerId: '3388000000000000000',
  classSuffix: 'card_1',
  objectSuffix: 'sn_123',
  issuerName: 'Nordstadt Betriebe GmbH',
  serial: 'SN-123',
  currentStamps: 0,
  barcodeMessage: 'https://stampie.de/s/SN-123',
  fallbackLogoUrl: 'https://stampie.de/api/wallet/logo/card_1',
  heroUrl: 'https://stampie.de/api/wallet/hero/card_1?s=0',
}

const design = (over: Partial<CardDesignInput> = {}): CardDesignInput => ({
  ...DEFAULT_CARD_DESIGN,
  offerTitle: '20 % auf alles',
  ...over,
})

describe('buildOfferClass', () => {
  // Google rejects a class missing any of these, and the only feedback is a generic
  // failure — so each one is asserted rather than trusted.
  it('sets every field Google marks required', () => {
    const cls = buildOfferClass(design(), ctx)
    expect(cls.title).toBe('20 % auf alles')
    expect(cls.provider).toBe('Nordstadt Betriebe GmbH')
    expect(cls.issuerName).toBe('Nordstadt Betriebe GmbH')
    expect(cls.redemptionChannel).toBe('INSTORE')
    expect(cls.reviewStatus).toBe('UNDER_REVIEW')
    expect(cls.id).toBe('3388000000000000000.card_1')
  })

  it('never emits an empty title, even for an untouched draft', () => {
    expect(buildOfferClass(design({ offerTitle: null }), ctx).title).toBe('Gutschein')
    expect(buildOfferClass(design({ offerTitle: '   ' }), ctx).title).toBe('Gutschein')
  })

  it('follows the issuer override for both issuerName and provider', () => {
    const cls = buildOfferClass(design({ issuerDisplayName: 'Café Nordstadt' }), ctx)
    expect(cls.issuerName).toBe('Café Nordstadt')
    expect(cls.provider).toBe('Café Nordstadt')
  })

  it('carries details and fine print only when filled in', () => {
    expect(buildOfferClass(design(), ctx).details).toBeUndefined()
    expect(buildOfferClass(design(), ctx).finePrint).toBeUndefined()
    const cls = buildOfferClass(design({ offerDetails: 'Alles', offerFinePrint: 'Nur einmal' }), ctx)
    expect(cls.details).toBe('Alles')
    expect(cls.finePrint).toBe('Nur einmal')
  })

  it('uses hex for the background, like every Google class', () => {
    expect(buildOfferClass(design({ backgroundColor: '#3c414c' }), ctx).hexBackgroundColor).toBe('#3c414c')
  })

  it('falls back to the generated logo — a class without one is rejected', () => {
    expect(buildOfferClass(design(), ctx).programLogo?.sourceUri.uri).toContain('/api/wallet/logo/')
  })

  it('routes links and text modules the same way the loyalty class does', () => {
    const backFields: BackField[] = [
      { id: 'w', type: 'url', label: 'Website', value: 'https://cafe-nord.de' },
      { id: 't', type: 'phone', label: 'Telefon', value: '+49 30 1234567' },
      { id: 'a', type: 'address', label: 'Adresse', value: 'Hauptstr. 1' },
    ]
    const cls = buildOfferClass(design({ backFields }), ctx)
    expect(cls.linksModuleData!.uris.map((u) => u.id)).toEqual(['w', 't'])
    expect(cls.linksModuleData!.uris[1]!.uri).toBe('tel:+49301234567')
    expect(cls.textModulesData!.map((t) => t.id)).toEqual(['a'])
  })

  it('does not carry the stamp card reward as a text module', () => {
    const cls = buildOfferClass(design({ rewardText: 'Jeder 10. Kaffee gratis' }), ctx)
    expect(JSON.stringify(cls)).not.toContain('Jeder 10. Kaffee gratis')
  })

  it.each(['INSTORE', 'ONLINE', 'BOTH'] as const)('passes redemption channel %s through', (c) => {
    expect(buildOfferClass(design({ redemptionChannel: c }), ctx).redemptionChannel).toBe(c)
  })
})

describe('buildOfferObject', () => {
  it('is ACTIVE while unredeemed', () => {
    expect(buildOfferObject(design(), ctx).state).toBe('ACTIVE')
    expect(buildOfferObject(design(), ctx, { redeemed: false }).state).toBe('ACTIVE')
  })

  // There is no "redeemed" field in the API — expiring the object is the only lever.
  it('is EXPIRED once redeemed, which is how Google retires a coupon', () => {
    expect(buildOfferObject(design(), ctx, { redeemed: true }).state).toBe('EXPIRED')
  })

  it('links to its class and carries the serial as barcode alternateText', () => {
    const obj = buildOfferObject(design(), ctx)
    expect(obj.classId).toBe('3388000000000000000.card_1')
    expect(obj.id).toBe('3388000000000000000.sn_123')
    expect(obj.barcode.value).toBe('https://stampie.de/s/SN-123')
    expect(obj.barcode.alternateText).toBe('SN-123')
  })

  it('maps barcode formats to Google names', () => {
    expect(buildOfferObject(design({ barcodeFormat: 'CODE128' }), ctx).barcode.type).toBe('CODE_128')
  })

  it('carries the expiry when set', () => {
    const obj = buildOfferObject(design({ expiresAt: new Date('2030-06-01T00:00:00Z') }), ctx)
    expect(obj.validTimeInterval!.end.date).toBe('2030-06-01T00:00:00.000Z')
  })

  it('has no loyaltyPoints — a coupon does not count anything', () => {
    expect(JSON.stringify(buildOfferObject(design(), ctx))).not.toContain('loyaltyPoints')
  })
})
