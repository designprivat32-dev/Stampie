import { describe, expect, it } from 'vitest'
import type { CardDesign as CardDesignRow } from '@prisma/client'
import { designToRow, rowToDesign } from '@/lib/cards/repository'
import { DEFAULT_CARD_DESIGN } from '@/lib/cards/defaults'
import { resolveIssuerName } from '@/lib/cards/issuer'
import type { CardDesignInput } from '@/lib/cards/schema'

/**
 * `rowToDesign` hands an untyped object to Zod, so a column the mapper forgets does not
 * fail the build — it silently arrives as `undefined` and picks up the schema default. That
 * is how the whole Google Wallet tab once saved nothing at all. This round-trip is the
 * guard: every design key must survive a write followed by a read.
 */

const FILLED_DESIGN: CardDesignInput = {
  ...DEFAULT_CARD_DESIGN,
  backgroundColor: '#3f2a1d',
  foregroundColor: '#fff8f0',
  labelColor: '#d9c4b0',
  stampGoal: 8,
  stampIcon: 'coffee',
  emptyStampStyle: 'dashed',
  rewardText: 'Jeder 8. Kaffee gratis',
  programName: 'Kaffeekarte',
  cardTitle: 'Kaffee sammeln',
  issuerDisplayName: 'Café Nordstadt',
  stampLabel: 'Kaffee',
  rewardCouponEnabled: true,
  offerTitle: '20 % auf alles',
  offerDetails: 'Gilt auf das gesamte Sortiment.',
  offerFinePrint: 'Nicht mit anderen Aktionen kombinierbar.',
  redemptionChannel: 'BOTH',
  accountNameLabel: 'Mitglied',
  accountIdLabel: 'Nr.',
  rewardsTierLabel: 'Stufe',
  rewardsTier: 'Gold',
  googleAccountNameEnabled: true,
  googleRewardsTierEnabled: true,
  barcodeFormat: 'CODE128',
  geoNotificationsEnabled: false,
  shareable: false,
}

/** The columns the design mapper does not own, filled with anything valid. */
function asRow(design: CardDesignInput): CardDesignRow {
  return {
    ...designToRow(design),
    id: 'cloc00000000000000000002',
    cardId: 'cloc00000000000000000001',
    status: 'DRAFT',
    version: 1,
    contrastOverrideBy: null,
    contrastOverrideAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as CardDesignRow
}

describe('design persistence round-trip', () => {
  it('preserves every field through designToRow -> rowToDesign', () => {
    expect(rowToDesign(asRow(FILLED_DESIGN))).toEqual(FILLED_DESIGN)
  })

  it('covers every key of the design — no column may be dropped by the mapper', () => {
    const restored = rowToDesign(asRow(FILLED_DESIGN))
    for (const key of Object.keys(FILLED_DESIGN) as Array<keyof CardDesignInput>) {
      expect(restored[key], `field "${key}" did not survive the round-trip`).toEqual(
        FILLED_DESIGN[key],
      )
    }
  })

  it('keeps the Google Wallet tab settings, which used to be dropped silently', () => {
    const restored = rowToDesign(asRow(FILLED_DESIGN))
    expect(restored.rewardsTier).toBe('Gold')
    expect(restored.accountNameLabel).toBe('Mitglied')
    expect(restored.googleRewardsTierEnabled).toBe(true)
    expect(restored.googleAccountNameEnabled).toBe(true)
  })
})

describe('resolveIssuerName', () => {
  it('prefers the per-card override', () => {
    expect(resolveIssuerName({ issuerDisplayName: 'Café Nordstadt' }, 'Nordstadt Betriebe GmbH')).toBe(
      'Café Nordstadt',
    )
  })

  it('falls back to the organisation when unset or blank', () => {
    expect(resolveIssuerName({ issuerDisplayName: null }, 'Nordstadt Betriebe GmbH')).toBe(
      'Nordstadt Betriebe GmbH',
    )
    expect(resolveIssuerName({ issuerDisplayName: '   ' }, 'Nordstadt Betriebe GmbH')).toBe(
      'Nordstadt Betriebe GmbH',
    )
  })

  it('trims the override rather than shipping padded whitespace to the wallet', () => {
    expect(resolveIssuerName({ issuerDisplayName: '  Café Nordstadt  ' }, 'Fallback')).toBe(
      'Café Nordstadt',
    )
  })
})
