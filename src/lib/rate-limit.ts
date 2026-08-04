/**
 * In-memory fixed-window rate limiter.
 *
 * Good enough for a single-instance deployment and for the two endpoints that need it
 * (uploads, test-card e-mail). Swap for Redis when the app runs on more than one node —
 * the call sites do not change.
 */

interface Window {
  count: number
  resetAt: number
}

const windows = new Map<string, Window>()

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  const existing = windows.get(key)

  if (!existing || existing.resetAt <= now) {
    const fresh: Window = { count: 1, resetAt: now + windowMs }
    windows.set(key, fresh)
    pruneOccasionally(now)
    return { allowed: true, remaining: limit - 1, resetAt: fresh.resetAt }
  }

  existing.count++
  return {
    allowed: existing.count <= limit,
    remaining: Math.max(0, limit - existing.count),
    resetAt: existing.resetAt,
  }
}

let lastPrune = 0
function pruneOccasionally(now: number): void {
  if (now - lastPrune < 60_000) return
  lastPrune = now
  for (const [key, w] of windows) {
    if (w.resetAt <= now) windows.delete(key)
  }
}

export function resetRateLimits(): void {
  windows.clear()
}
