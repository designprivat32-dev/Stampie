import type { CardDesignInput } from './schema'
import type { StripTarget } from './render-strip'

/**
 * Builds the /api/preview/strip URL for a design state.
 *
 * `v` is a client-side hash of exactly the fields that change the pixels. The server
 * ignores it — its only job is to make each distinct design state its own URL, so the
 * browser can cache the image immutably and a change swaps in a *new* image instead of
 * re-fetching the same one.
 */

export interface StripUrlOptions {
  cardId: string
  currentStamps: number
  target?: StripTarget
  scale?: 1 | 2 | 3
}

/** FNV-1a — no crypto needed, this is a cache key, not a security control. */
function hash(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(36)
}

export function stripPreviewUrl(design: CardDesignInput, options: StripUrlOptions): string {
  const target = options.target ?? 'apple'
  const scale = options.scale ?? 2
  const stamps = Math.max(0, Math.min(design.stampGoal, options.currentStamps))

  const params = new URLSearchParams({
    card: options.cardId,
    n: String(design.stampGoal),
    s: String(stamps),
    fg: design.foregroundColor.replace('#', ''),
    bg: design.backgroundColor.replace('#', ''),
    icon: design.stampIcon,
    empty: design.emptyStampStyle,
    t: target,
    x: String(scale),
  })

  if (design.stampIconAssetId) params.set('iconAsset', design.stampIconAssetId)
  if (design.heroAssetId) params.set('heroAsset', design.heroAssetId)

  params.set('v', hash(params.toString()))

  return `/api/preview/strip?${params.toString()}`
}
