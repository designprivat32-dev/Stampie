import { describe, expect, it } from 'vitest'
import { buildStripSvg } from '@/lib/cards/strip-svg'
import { APPLE_STRIP_CANVAS } from '@/lib/cards/stamp-layout'
import { walletHeroUrl } from '@/lib/wallet/image-urls'
import { stripPreviewUrl } from '@/lib/cards/preview-url'
import { DEFAULT_CARD_DESIGN } from '@/lib/cards/defaults'
import { cardDesignDraftSchema } from '@/lib/cards/schema'

/**
 * Abwechselnde Stempelbilder.
 *
 * Wichtigster Punkt: eine Karte ohne weitere Bilder rendert und adressiert exakt wie
 * vorher. Bestehende Karten im Umlauf dürfen sich durch das Feature nicht verändern.
 */

const base = {
  stampGoal: 6,
  currentStamps: 6,
  foregroundColor: '#ffffff',
  backgroundColor: '#000000',
  stampIcon: 'custom',
  emptyStampStyle: 'transparent' as const,
  customIconBase64: 'AAAA',
}

const hrefs = (svg: string) =>
  [...svg.matchAll(/href="data:image\/png;base64,([^"]+)"/g)].map((m) => m[1])

describe('buildStripSvg with alternating icons', () => {
  it('uses the single icon everywhere when there are no extras', () => {
    const svg = buildStripSvg(base, APPLE_STRIP_CANVAS)
    expect(hrefs(svg)).toEqual(['AAAA', 'AAAA', 'AAAA', 'AAAA', 'AAAA', 'AAAA'])
  })

  it('renders identically with an empty extras list', () => {
    expect(buildStripSvg({ ...base, extraIconsBase64: [] }, APPLE_STRIP_CANVAS)).toBe(
      buildStripSvg(base, APPLE_STRIP_CANVAS),
    )
  })

  it('cycles through the icons in order', () => {
    const svg = buildStripSvg({ ...base, extraIconsBase64: ['BBBB', 'CCCC'] }, APPLE_STRIP_CANVAS)
    expect(hrefs(svg)).toEqual(['AAAA', 'BBBB', 'CCCC', 'AAAA', 'BBBB', 'CCCC'])
  })

  it('keeps the same icon per slot for faded open stamps', () => {
    const svg = buildStripSvg(
      { ...base, currentStamps: 2, extraIconsBase64: ['BBBB'] },
      APPLE_STRIP_CANVAS,
    )
    expect(hrefs(svg)).toEqual(['AAAA', 'BBBB', 'AAAA', 'BBBB', 'AAAA', 'BBBB'])
  })

  it('ignores extras when there is no primary custom icon', () => {
    const svg = buildStripSvg(
      { ...base, stampIcon: 'coffee', customIconBase64: null, extraIconsBase64: ['BBBB'] },
      APPLE_STRIP_CANVAS,
    )
    expect(hrefs(svg)).toEqual([])
  })
})

describe('URLs stay stable for existing cards', () => {
  const design = { ...DEFAULT_CARD_DESIGN, stampIcon: 'custom', stampIconAssetId: 'cl0000000000000000000001' }

  it('does not change the Google hero URL without extras', () => {
    const url = walletHeroUrl('https://x', 'card', design, 3)
    // Ohne das Feld (alte Zeilen) und mit leerem Feld: dieselbe URL.
    expect(walletHeroUrl('https://x', 'card', { ...design, stampIconExtraAssetIds: [] }, 3)).toBe(url)
  })

  it('changes the URLs once extras are added', () => {
    const withExtras = { ...design, stampIconExtraAssetIds: ['cl0000000000000000000002'] }
    expect(walletHeroUrl('https://x', 'card', withExtras, 3)).not.toBe(
      walletHeroUrl('https://x', 'card', design, 3),
    )
    expect(stripPreviewUrl(withExtras, { cardId: 'c', currentStamps: 1 })).toContain('iconAssets=')
    expect(stripPreviewUrl(design, { cardId: 'c', currentStamps: 1 })).not.toContain('iconAssets')
  })
})

describe('schema', () => {
  it('reads an old design without the field as no extras', () => {
    const { stampIconExtraAssetIds: _omit, ...old } = DEFAULT_CARD_DESIGN
    const parsed = cardDesignDraftSchema.parse(old)
    expect(parsed.stampIconExtraAssetIds).toEqual([])
  })

  it('caps the number of images', () => {
    const tooMany = Array.from({ length: 10 }, (_, i) => `cl00000000000000000000${String(i).padStart(2, '0')}`)
    const parsed = cardDesignDraftSchema.safeParse({ ...DEFAULT_CARD_DESIGN, stampIconExtraAssetIds: tooMany })
    expect(parsed.success).toBe(false)
  })
})
