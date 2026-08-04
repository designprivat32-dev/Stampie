import 'server-only'
import sharp from 'sharp'
import { toHex, type Rgb } from './convert'
import { autoFixForeground, contrastRatio, readableOn } from './contrast'

/**
 * Pulls the dominant colours out of an uploaded logo so the editor can offer a one-click
 * palette. Saves about five minutes per sales conversation, which is the entire point.
 *
 * Method: downscale to 64x64, quantise each channel into 4 buckets (64 bins), drop
 * near-transparent and near-grey pixels, then rank by frequency.
 */

export interface PaletteSuggestion {
  /** Ranked dominant colours, most frequent first. */
  colors: string[]
  /** Ready-to-apply combination derived from the most usable dominant colour. */
  recommended: {
    backgroundColor: string
    foregroundColor: string
    labelColor: string
  }
}

const SAMPLE_SIZE = 64
const BUCKETS = 4
const BUCKET_WIDTH = 256 / BUCKETS

export async function extractPalette(image: Buffer, max = 6): Promise<PaletteSuggestion> {
  const { data, info } = await sharp(image)
    .resize(SAMPLE_SIZE, SAMPLE_SIZE, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const counts = new Map<number, { count: number; sum: Rgb }>()
  const channels = info.channels

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i]!
    const g = data[i + 1]!
    const b = data[i + 2]!
    const a = channels > 3 ? data[i + 3]! : 255
    if (a < 128) continue

    const max0 = Math.max(r, g, b)
    const min0 = Math.min(r, g, b)
    // Skip near-greys and near-whites: they are background, not brand colour.
    const isGrey = max0 - min0 < 18
    const isExtreme = max0 > 244 || max0 < 12
    if (isGrey || isExtreme) continue

    const key =
      Math.floor(r / BUCKET_WIDTH) * BUCKETS * BUCKETS +
      Math.floor(g / BUCKET_WIDTH) * BUCKETS +
      Math.floor(b / BUCKET_WIDTH)

    const entry = counts.get(key)
    if (entry) {
      entry.count++
      entry.sum.r += r
      entry.sum.g += g
      entry.sum.b += b
    } else {
      counts.set(key, { count: 1, sum: { r, g, b } })
    }
  }

  const ranked = [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, max)
    .map((e) => toHex({ r: e.sum.r / e.count, g: e.sum.g / e.count, b: e.sum.b / e.count }))

  // No usable chroma in the logo (pure black/white mark) — fall back to the neutral look.
  const primary = ranked[0] ?? '#1a1a1a'
  const foreground = readableOn(primary)
  const labelBase = ranked[1] ?? foreground

  return {
    colors: ranked,
    recommended: {
      backgroundColor: primary,
      foregroundColor: foreground,
      // The label colour is allowed to be softer, but must still clear 4.5:1.
      labelColor:
        contrastRatio(labelBase, primary) >= 4.5 ? labelBase : autoFixForeground(labelBase, primary),
    },
  }
}
