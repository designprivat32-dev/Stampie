import { describe, expect, it } from 'vitest'
import {
  MAX_GEO_LOCATIONS,
  STAMP_GOAL_MAX,
  STAMP_GOAL_MIN,
  buildPublishSchema,
  cardDesignDraftSchema,
  cardDesignPublishSchema,
  type CardDesignInput,
} from '@/lib/cards/schema'
import { DEFAULT_CARD_DESIGN, isPristineDesign } from '@/lib/cards/defaults'

const draft = (over: Partial<CardDesignInput> = {}): unknown => ({ ...DEFAULT_CARD_DESIGN, ...over })

const publishable = (over: Partial<CardDesignInput> = {}): unknown =>
  draft({
    programName: 'Kaffeekarte',
    rewardText: 'Jeder 10. Kaffee gratis',
    iconAssetId: 'clh0000000000000000000000',
    backFields: [
      { id: 'a', type: 'legal', kind: 'imprint', label: 'Impressum', value: 'https://example.de/impressum' },
      { id: 'b', type: 'legal', kind: 'privacy', label: 'Datenschutz', value: 'https://example.de/datenschutz' },
    ],
    ...over,
  })

describe('cardDesignDraftSchema', () => {
  it('accepts the default design so a fresh draft can autosave', () => {
    expect(cardDesignDraftSchema.safeParse(draft()).success).toBe(true)
  })

  describe('stampGoal', () => {
    it.each([STAMP_GOAL_MIN, 10, STAMP_GOAL_MAX])('accepts %i', (n) => {
      expect(cardDesignDraftSchema.safeParse(draft({ stampGoal: n })).success).toBe(true)
    })
    it.each([2, 21, 0, -1, 10.5])('rejects %s', (n) => {
      expect(cardDesignDraftSchema.safeParse(draft({ stampGoal: n as number })).success).toBe(false)
    })
  })

  describe('colours', () => {
    it('accepts #rrggbb and lower-cases it', () => {
      const r = cardDesignDraftSchema.parse(draft({ backgroundColor: '#AABBCC' }))
      expect(r.backgroundColor).toBe('#aabbcc')
    })
    it.each(['#abc', 'rgb(1,2,3)', 'red', '#12345', '#1234567'])('rejects %s', (c) => {
      expect(cardDesignDraftSchema.safeParse(draft({ backgroundColor: c })).success).toBe(false)
    })
  })

  describe('geoLocations', () => {
    const geo = (i: number) => ({
      id: `g${i}`,
      label: `Standort ${i}`,
      latitude: 52.5,
      longitude: 13.4,
      maxDistance: 100,
      relevantText: 'Karte bereit',
    })

    it(`accepts ${MAX_GEO_LOCATIONS}`, () => {
      const list = Array.from({ length: MAX_GEO_LOCATIONS }, (_, i) => geo(i))
      expect(cardDesignDraftSchema.safeParse(draft({ geoLocations: list as never })).success).toBe(true)
    })

    it(`rejects ${MAX_GEO_LOCATIONS + 1} — PassKit hard limit`, () => {
      const list = Array.from({ length: MAX_GEO_LOCATIONS + 1 }, (_, i) => geo(i))
      expect(cardDesignDraftSchema.safeParse(draft({ geoLocations: list as never })).success).toBe(false)
    })

    it('rejects an out-of-range radius', () => {
      expect(
        cardDesignDraftSchema.safeParse(draft({ geoLocations: [{ ...geo(0), maxDistance: 9 }] as never }))
          .success,
      ).toBe(false)
      expect(
        cardDesignDraftSchema.safeParse(draft({ geoLocations: [{ ...geo(0), maxDistance: 5001 }] as never }))
          .success,
      ).toBe(false)
    })

    it('rejects a relevantText over 60 characters', () => {
      expect(
        cardDesignDraftSchema.safeParse(
          draft({ geoLocations: [{ ...geo(0), relevantText: 'x'.repeat(61) }] as never }),
        ).success,
      ).toBe(false)
    })
  })

  describe('backFields', () => {
    it('accepts the discriminated union', () => {
      const r = cardDesignDraftSchema.safeParse(
        draft({
          backFields: [
            { id: '1', type: 'text', label: 'Hinweis', value: 'Bitte vorzeigen' },
            { id: '2', type: 'url', label: 'Website', value: 'https://example.de' },
            { id: '3', type: 'phone', label: 'Telefon', value: '+49 30 1234567' },
            { id: '4', type: 'legal', kind: 'terms', label: 'AGB', value: 'https://example.de/agb' },
          ] as never,
        }),
      )
      expect(r.success).toBe(true)
    })

    it('rejects a url field that is not a URL', () => {
      expect(
        cardDesignDraftSchema.safeParse(
          draft({ backFields: [{ id: '1', type: 'url', label: 'Web', value: 'example.de' }] as never }),
        ).success,
      ).toBe(false)
    })

    it('rejects an unknown field type', () => {
      expect(
        cardDesignDraftSchema.safeParse(
          draft({ backFields: [{ id: '1', type: 'video', label: 'x', value: 'y' }] as never }),
        ).success,
      ).toBe(false)
    })

    it('rejects duplicate ids (drag & drop relies on them)', () => {
      expect(
        cardDesignDraftSchema.safeParse(
          draft({
            backFields: [
              { id: 'same', type: 'text', label: 'A', value: '1' },
              { id: 'same', type: 'text', label: 'B', value: '2' },
            ] as never,
          }),
        ).success,
      ).toBe(false)
    })

    it('rejects two imprint links', () => {
      expect(
        cardDesignDraftSchema.safeParse(
          draft({
            backFields: [
              { id: '1', type: 'legal', kind: 'imprint', label: 'A', value: 'https://a.de' },
              { id: '2', type: 'legal', kind: 'imprint', label: 'B', value: 'https://b.de' },
            ] as never,
          }),
        ).success,
      ).toBe(false)
    })

    it('rejects more than 50 fields', () => {
      const many = Array.from({ length: 51 }, (_, i) => ({
        id: `f${i}`,
        type: 'text' as const,
        label: 'L',
        value: 'V',
      }))
      expect(cardDesignDraftSchema.safeParse(draft({ backFields: many as never })).success).toBe(false)
    })
  })

  describe('stampIcon', () => {
    it.each(['coffee', 'pizza'])('accepts library icon %s', (v) => {
      expect(cardDesignDraftSchema.safeParse(draft({ stampIcon: v })).success).toBe(true)
    })

    it.each(['emoji:2615', 'emoji:1f469-200d-1f373'])(
      'accepts %s, but only together with its rasterised asset',
      (v) => {
        expect(cardDesignDraftSchema.safeParse(draft({ stampIcon: v })).success).toBe(false)
        expect(
          cardDesignDraftSchema.safeParse(
            draft({ stampIcon: v, stampIconAssetId: 'clh0000000000000000000000' }),
          ).success,
        ).toBe(true)
      },
    )

    it.each(['banana', 'emoji:zzzz', '<script>'])('rejects %s', (v) => {
      expect(cardDesignDraftSchema.safeParse(draft({ stampIcon: v })).success).toBe(false)
    })

    it('requires an asset for a custom icon', () => {
      expect(cardDesignDraftSchema.safeParse(draft({ stampIcon: 'custom' })).success).toBe(false)
      expect(
        cardDesignDraftSchema.safeParse(
          draft({ stampIcon: 'custom', stampIconAssetId: 'clh0000000000000000000000' }),
        ).success,
      ).toBe(true)
    })
  })

  it.each(['QR', 'CODE128', 'PDF417', 'AZTEC'])('accepts barcode format %s', (f) => {
    expect(cardDesignDraftSchema.safeParse(draft({ barcodeFormat: f as never })).success).toBe(true)
  })

  it('rejects an unknown barcode format', () => {
    expect(cardDesignDraftSchema.safeParse(draft({ barcodeFormat: 'EAN13' as never })).success).toBe(false)
  })
})

describe('cardDesignPublishSchema', () => {
  it('accepts a complete design', () => {
    const r = cardDesignPublishSchema.safeParse(publishable())
    expect(r.success).toBe(true)
  })

  it('is strictly stronger than the draft schema', () => {
    expect(cardDesignDraftSchema.safeParse(draft()).success).toBe(true)
    expect(cardDesignPublishSchema.safeParse(draft()).success).toBe(false)
  })

  it.each([
    ['programName', { programName: '   ' }],
    ['rewardText', { rewardText: '' }],
    ['iconAssetId', { iconAssetId: null }],
  ] as const)('blocks publishing without %s', (_name, over) => {
    expect(cardDesignPublishSchema.safeParse(publishable(over as Partial<CardDesignInput>)).success).toBe(
      false,
    )
  })

  it('blocks publishing without an imprint link', () => {
    const r = cardDesignPublishSchema.safeParse(
      publishable({
        backFields: [
          { id: 'b', type: 'legal', kind: 'privacy', label: 'Datenschutz', value: 'https://x.de/d' },
        ] as never,
      }),
    )
    expect(r.success).toBe(false)
    expect(JSON.stringify(r)).toContain('Impressum')
  })

  it('blocks publishing without a privacy link', () => {
    const r = cardDesignPublishSchema.safeParse(
      publishable({
        backFields: [
          { id: 'a', type: 'legal', kind: 'imprint', label: 'Impressum', value: 'https://x.de/i' },
        ] as never,
      }),
    )
    expect(r.success).toBe(false)
    expect(JSON.stringify(r)).toContain('Datenschutz')
  })

  it('blocks publishing below 3:1 contrast', () => {
    const r = cardDesignPublishSchema.safeParse(
      publishable({ foregroundColor: '#cccccc', backgroundColor: '#ffffff' }),
    )
    expect(r.success).toBe(false)
    expect(JSON.stringify(r)).toContain('Kontrast')
  })

  it('allows publishing below 3:1 once the user has explicitly confirmed', () => {
    const schema = buildPublishSchema({ contrastConfirmed: true })
    const r = schema.safeParse(publishable({ foregroundColor: '#cccccc', backgroundColor: '#ffffff' }))
    expect(r.success).toBe(true)
  })

  it('warns but does not block between 3:1 and 4.5:1', () => {
    const r = cardDesignPublishSchema.safeParse(
      publishable({ foregroundColor: '#ff2fb9', backgroundColor: '#ffffff' }),
    )
    expect(r.success).toBe(true)
  })

  it('rejects an expiry date in the past', () => {
    expect(cardDesignPublishSchema.safeParse(publishable({ expiresAt: new Date('2020-01-01') })).success).toBe(
      false,
    )
  })
})

describe('publish schema for a coupon', () => {
  const couponSchema = buildPublishSchema({ contrastConfirmed: false, kind: 'COUPON' })

  /** A coupon needs the legal links and the icon, but an offer title instead of a reward. */
  const publishableCoupon = (over: Partial<CardDesignInput> = {}): unknown =>
    publishable({ programName: '', rewardText: '', offerTitle: '20 % auf alles', ...over })

  it('accepts a coupon with an offer title but no reward text', () => {
    expect(couponSchema.safeParse(publishableCoupon()).success).toBe(true)
  })

  it('blocks a coupon without an offer title', () => {
    const r = couponSchema.safeParse(publishableCoupon({ offerTitle: null }))
    expect(r.success).toBe(false)
    expect(JSON.stringify(r)).toContain('Gutschein-Titel')
  })

  it('blocks a coupon whose offer title is only whitespace', () => {
    expect(couponSchema.safeParse(publishableCoupon({ offerTitle: '   ' })).success).toBe(false)
  })

  it('still demands icon, imprint and privacy — those are not stamp-specific', () => {
    expect(couponSchema.safeParse(publishableCoupon({ iconAssetId: null })).success).toBe(false)
    expect(couponSchema.safeParse(publishableCoupon({ backFields: [] })).success).toBe(false)
  })

  it('does not accept a stamp card design that lacks an offer title', () => {
    expect(couponSchema.safeParse(publishable()).success).toBe(false)
  })

  it('the stamp schema ignores the offer title and still wants a reward', () => {
    expect(
      cardDesignPublishSchema.safeParse(publishable({ rewardText: '', offerTitle: '20 % auf alles' }))
        .success,
    ).toBe(false)
  })

  it.each(['INSTORE', 'ONLINE', 'BOTH'])('accepts redemption channel %s', (c) => {
    expect(
      cardDesignDraftSchema.safeParse(draft({ redemptionChannel: c as never })).success,
    ).toBe(true)
  })

  it('rejects an unknown redemption channel', () => {
    expect(
      cardDesignDraftSchema.safeParse(draft({ redemptionChannel: 'BY_POST' as never })).success,
    ).toBe(false)
  })
})

describe('stamp card that hands out a coupon as its reward', () => {
  it('publishes fine while the reward coupon is switched off', () => {
    expect(cardDesignPublishSchema.safeParse(publishable({ rewardCouponEnabled: false })).success).toBe(
      true,
    )
  })

  // Google rejects an OfferClass without a title, so a card promising a coupon it cannot
  // describe would fail at the moment a customer fills it — far too late.
  it('blocks publishing once the coupon is switched on but has no title', () => {
    const r = cardDesignPublishSchema.safeParse(
      publishable({ rewardCouponEnabled: true, offerTitle: null }),
    )
    expect(r.success).toBe(false)
    expect(JSON.stringify(r)).toContain('Gutschein-Titel')
  })

  it('publishes with the coupon switched on and a title set', () => {
    expect(
      cardDesignPublishSchema.safeParse(
        publishable({ rewardCouponEnabled: true, offerTitle: '20 % auf alles' }),
      ).success,
    ).toBe(true)
  })

  it('still demands the reward text — the coupon replaces the pass, not the promise', () => {
    expect(
      cardDesignPublishSchema.safeParse(
        publishable({ rewardCouponEnabled: true, offerTitle: '20 % auf alles', rewardText: '' }),
      ).success,
    ).toBe(false)
  })
})

describe('isPristineDesign', () => {
  it('holds for a freshly created draft', () => {
    expect(isPristineDesign(DEFAULT_CARD_DESIGN)).toBe(true)
    expect(isPristineDesign({ ...DEFAULT_CARD_DESIGN })).toBe(true)
  })

  it.each([
    ['a colour', { backgroundColor: '#ff0000' }],
    ['a programme name', { programName: 'Kaffeekarte' }],
    ['an uploaded logo', { logoAssetId: 'asset_1' }],
    ['the stamp goal', { stampGoal: 8 }],
    ['an expiry date', { expiresAt: new Date('2030-01-01') }],
  ] as const)('breaks once the owner has set %s', (_what, over) => {
    expect(isPristineDesign({ ...DEFAULT_CARD_DESIGN, ...over })).toBe(false)
  })

  it('counts a back field as a touch — otherwise the picker greets a designed card', () => {
    const design = {
      ...DEFAULT_CARD_DESIGN,
      backFields: [{ id: 'f_1', type: 'text', label: 'Hinweis', value: 'Bitte vorzeigen' }],
    } satisfies CardDesignInput
    expect(isPristineDesign(design)).toBe(false)
  })
})
