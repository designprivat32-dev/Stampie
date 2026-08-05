import type { CardDesignInput } from '@/lib/cards/schema'
import { STRIP_RENDERER_VERSION } from '@/lib/cards/stamp-layout'

/**
 * URLs for the images Google fetches.
 *
 * Google caches pass images by URL and does not revalidate. A stable URL therefore means
 * a logo or stamp row that can never change again — the shop owner uploads a new logo,
 * everything on our side is correct, and the wallet keeps showing the old one forever.
 *
 * So every URL carries a hash of the fields that affect its pixels. Change the design,
 * get a new URL, get a fresh fetch.
 */

/** FNV-1a. This is a cache key, not a security control. */
function hash(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(36)
}

/**
 * Bumped whenever the logo *renderer* changes.
 *
 * The hash below covers the design, not the code. Without this constant a rendering fix
 * keeps the old URL, and Google — which caches pass images by URL and never revalidates —
 * goes on serving the broken logo forever.
 */
const LOGO_RENDERER_VERSION = '4'

/** Fields the generated logo depends on. */
function logoVersion(design: CardDesignInput): string {
  return hash(
    [
      LOGO_RENDERER_VERSION,
      design.squareLogoAssetId ?? '',
      design.logoAssetId ?? '',
      design.backgroundColor,
      design.foregroundColor,
      design.stampIcon,
    ].join('|'),
  )
}

/**
 * Fields the stamp row depends on, stamp count excluded — that travels separately.
 *
 * `STRIP_RENDERER_VERSION` is the same argument as `LOGO_RENDERER_VERSION` above, for the
 * grid geometry: change how stamps are arranged and the design is untouched, so without it
 * Google keeps serving the previous arrangement.
 */
function heroVersion(design: CardDesignInput): string {
  return hash(
    [
      STRIP_RENDERER_VERSION,
      design.stampGoal,
      design.foregroundColor,
      design.backgroundColor,
      design.stampIcon,
      design.emptyStampStyle,
      design.stampIconAssetId ?? '',
      design.heroAssetId ?? '',
    ].join('|'),
  )
}

export function walletLogoUrl(baseUrl: string, cardId: string, design: CardDesignInput): string {
  return `${baseUrl}/api/wallet/logo/${cardId}?v=${logoVersion(design)}`
}

export function walletHeroUrl(
  baseUrl: string,
  cardId: string,
  design: CardDesignInput,
  stamps: number,
): string {
  const clamped = Math.max(0, Math.min(design.stampGoal, Math.round(stamps)))
  return `${baseUrl}/api/wallet/hero/${cardId}?s=${clamped}&v=${heroVersion(design)}`
}
