import { describe, expect, it } from 'vitest'
import { offersRewardCoupon } from '@/lib/cards/reward-coupon'
import { DEFAULT_CARD_DESIGN } from '@/lib/cards/defaults'
import type { CardDesignInput } from '@/lib/cards/schema'

const design = (over: Partial<CardDesignInput> = {}): CardDesignInput => ({
  ...DEFAULT_CARD_DESIGN,
  ...over,
})

/**
 * The gate in front of issuing a coupon. Getting it wrong in either direction is bad: a
 * missed coupon breaks a promise the card made, and a coupon without a title is a pass
 * Google refuses — discovered by the customer, at the counter.
 */
describe('offersRewardCoupon', () => {
  it('is off by default, so existing stamp cards keep behaving as before', () => {
    expect(offersRewardCoupon(design())).toBe(false)
  })

  it('needs both the switch and a title', () => {
    expect(offersRewardCoupon(design({ rewardCouponEnabled: true }))).toBe(false)
    expect(offersRewardCoupon(design({ offerTitle: '20 % auf alles' }))).toBe(false)
    expect(
      offersRewardCoupon(design({ rewardCouponEnabled: true, offerTitle: '20 % auf alles' })),
    ).toBe(true)
  })

  it('treats a whitespace-only title as no title', () => {
    expect(offersRewardCoupon(design({ rewardCouponEnabled: true, offerTitle: '   ' }))).toBe(false)
  })
})
