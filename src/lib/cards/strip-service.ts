import 'server-only'
import { createHash } from 'node:crypto'
import { loadStripAssets } from './asset-service'
import { renderStripImage, type StripScale, type StripTarget } from './render-strip'
import type { CardDesignInput } from './schema'

/**
 * Caching wrapper around the strip renderer for the live preview.
 *
 * The editor debounces at 150 ms, so a colour picker drag still produces a burst of
 * requests. A render costs ~10 ms, which is fine, but the same URL being requested twice
 * should never re-render — and because the cache key is the design hash, the browser can
 * cache the URL immutably and a design change simply produces a new URL. No flicker, no
 * cache busting by timestamp.
 */

/** Only the fields that actually change the pixels. */
export type StripRenderFields = Pick<
  CardDesignInput,
  | 'stampGoal'
  | 'foregroundColor'
  | 'backgroundColor'
  | 'stampIcon'
  | 'emptyStampStyle'
  | 'stampIconAssetId'
  | 'heroAssetId'
>

export function stripRenderFields(design: CardDesignInput): StripRenderFields {
  return {
    stampGoal: design.stampGoal,
    foregroundColor: design.foregroundColor,
    backgroundColor: design.backgroundColor,
    stampIcon: design.stampIcon,
    emptyStampStyle: design.emptyStampStyle,
    stampIconAssetId: design.stampIconAssetId,
    heroAssetId: design.heroAssetId,
  }
}

/**
 * Stable hash over the render-relevant fields. Doubles as cache key and as the `v`
 * parameter in the preview URL.
 */
export function designRenderHash(design: CardDesignInput): string {
  const f = stripRenderFields(design)
  const canonical = [
    f.stampGoal,
    f.foregroundColor,
    f.backgroundColor,
    f.stampIcon,
    f.emptyStampStyle,
    f.stampIconAssetId ?? '',
    f.heroAssetId ?? '',
  ].join('|')
  return createHash('sha256').update(canonical).digest('base64url').slice(0, 16)
}

interface CacheEntry {
  key: string
  buffer: Buffer
}

const MAX_ENTRIES = 200
const cache = new Map<string, CacheEntry>()

function cacheGet(key: string): Buffer | null {
  const entry = cache.get(key)
  if (!entry) return null
  // Refresh recency (Map preserves insertion order — re-insert to move to the end).
  cache.delete(key)
  cache.set(key, entry)
  return entry.buffer
}

function cacheSet(key: string, buffer: Buffer): void {
  cache.set(key, { key, buffer })
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next()
    if (oldest.done) break
    cache.delete(oldest.value)
  }
}

export interface RenderStripRequest {
  design: CardDesignInput
  cardId: string
  currentStamps: number
  scale: StripScale
  target: StripTarget
}

export async function renderStripCached(req: RenderStripRequest): Promise<Buffer> {
  const hash = designRenderHash(req.design)
  const key = `${hash}:${req.currentStamps}:${req.target}:${req.scale}`

  const hit = cacheGet(key)
  if (hit) return hit

  const assets = await loadStripAssets(req.design, req.cardId)
  const buffer = await renderStripImage(req.design, req.currentStamps, req.scale, {
    target: req.target,
    customIconPng: assets.customIconPng,
    backgroundPng: assets.backgroundPng,
  })

  cacheSet(key, buffer)
  return buffer
}

/** Called after an asset is replaced — the id stays the same but the bytes changed. */
export function invalidateStripCache(): void {
  cache.clear()
}
