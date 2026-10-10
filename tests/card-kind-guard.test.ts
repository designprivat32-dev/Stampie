import { describe, expect, it } from 'vitest'
import { isLoyaltyKind, loyaltyCardWhere, loyaltyPassWhere } from '@/lib/cards/kind'
import { buildPassJson, type BuildPassJsonContext } from '@/lib/cards/apple-pass-json'
import { buildLoyaltyClass, buildLoyaltyObject } from '@/lib/cards/google-loyalty'
import { buildOfferClass, buildOfferObject } from '@/lib/cards/google-offer'
import { DEFAULT_CARD_DESIGN } from '@/lib/cards/defaults'
import type { CardDesignInput } from '@/lib/cards/schema'

/**
 * Absicherung vor der Visitenkarte (PLAN-VISITENKARTEN.md, Phase 0).
 *
 * Die Snapshots halten fest, wie Stempelkarte und Gutschein heute im Wallet ankommen. Kommt
 * eine weitere Kartenart dazu, darf sich an diesen beiden nichts ändern — ändert sich ein
 * Snapshot, ist das ein Fehler, nicht etwas zum Aktualisieren.
 */

describe('isLoyaltyKind', () => {
  it.each(['STAMP', 'COUPON'])('accepts %s', (kind) => {
    expect(isLoyaltyKind(kind)).toBe(true)
  })

  it.each(['BUSINESS_CARD', '', 'stamp'])('rejects %j', (kind) => {
    expect(isLoyaltyKind(kind)).toBe(false)
  })
})

describe('loyalty query filters', () => {
  it('limits cards to stamp cards and coupons', () => {
    expect(loyaltyCardWhere()).toEqual({ kind: { in: ['STAMP', 'COUPON'] } })
  })

  it('limits passes through their card', () => {
    expect(loyaltyPassWhere()).toEqual({ card: { kind: { in: ['STAMP', 'COUPON'] } } })
  })

  it('hands out a fresh object every call', () => {
    expect(loyaltyCardWhere()).not.toBe(loyaltyCardWhere())
  })
})

const appleCtx: BuildPassJsonContext = {
  serial: 'SN-123',
  currentStamps: 6,
  organizationName: 'Café Nord',
  passTypeIdentifier: 'pass.de.stampie.card',
  teamIdentifier: 'ABCDE12345',
  barcodeMessage: 'https://stampie.de/s/SN-123',
  marketingConsent: true,
  customerName: 'Alex',
  memberSince: new Date(2026, 0, 15),
  message: 'Heute doppelte Stempel',
  webService: { url: 'https://stampie.de/api/apple-passkit', authenticationToken: 'tok' },
}

const googleCtx = {
  issuerId: '3388000000000000000',
  classSuffix: 'card_1',
  objectSuffix: 'sn_123',
  issuerName: 'Café Nord',
  serial: 'SN-123',
  currentStamps: 6,
  barcodeMessage: 'https://stampie.de/s/SN-123',
  fallbackLogoUrl: 'https://stampie.de/api/wallet/logo/card_1',
  heroUrl: 'https://stampie.de/api/wallet/hero/card_1?s=6',
  marketingConsent: true,
}

const design: CardDesignInput = {
  ...DEFAULT_CARD_DESIGN,
  programName: 'Kaffeekarte',
  rewardText: 'Jeder 10. Kaffee gratis',
  offerTitle: '20 % auf alles',
  offerDetails: 'Nur im Laden',
  offerFinePrint: 'Nicht mit anderen Aktionen kombinierbar',
}

describe('existing passes stay as they are', () => {
  it('Apple stamp card', () => {
    expect(buildPassJson(design, { ...appleCtx, kind: 'STAMP' })).toMatchSnapshot()
  })

  it('Apple coupon', () => {
    expect(buildPassJson(design, { ...appleCtx, kind: 'COUPON' })).toMatchSnapshot()
  })

  it('Google loyalty class and object', () => {
    expect(buildLoyaltyClass(design, googleCtx)).toMatchSnapshot()
    expect(buildLoyaltyObject(design, googleCtx)).toMatchSnapshot()
  })

  it('Google offer class and object', () => {
    expect(buildOfferClass(design, googleCtx)).toMatchSnapshot()
    expect(buildOfferObject(design, googleCtx)).toMatchSnapshot()
    expect(buildOfferObject(design, googleCtx, { redeemed: true })).toMatchSnapshot()
  })
})
