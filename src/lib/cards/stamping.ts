/**
 * Stamping rules, kept free of IO so they can be tested exhaustively.
 *
 * The rules exist because the counter is money: a stamp is a fraction of a free coffee.
 * Every one of these guards corresponds to a way the counter could otherwise be inflated,
 * by accident or on purpose.
 */

/** A card cannot be stamped twice in quick succession — double scans are common. */
export const STAMP_COOLDOWN_MS = 60_000

export type StampDecision =
  | { ok: true; nextBalance: number; completesCard: boolean }
  | { ok: false; reason: 'cooldown'; retryInMs: number }
  | { ok: false; reason: 'already_full' }

export interface StampState {
  stamps: number
  stampGoal: number
  lastStampAt: Date | null
}

export function decideStamp(state: StampState, now: Date = new Date()): StampDecision {
  if (state.stamps >= state.stampGoal) return { ok: false, reason: 'already_full' }

  if (state.lastStampAt) {
    const elapsed = now.getTime() - state.lastStampAt.getTime()
    if (elapsed < STAMP_COOLDOWN_MS) {
      return { ok: false, reason: 'cooldown', retryInMs: STAMP_COOLDOWN_MS - elapsed }
    }
  }

  const nextBalance = state.stamps + 1
  return { ok: true, nextBalance, completesCard: nextBalance >= state.stampGoal }
}

export type RedeemDecision = { ok: true; nextBalance: number } | { ok: false; reason: 'not_full' }

export function decideRedeem(state: Pick<StampState, 'stamps' | 'stampGoal'>): RedeemDecision {
  if (state.stamps < state.stampGoal) return { ok: false, reason: 'not_full' }
  // A full card is cashed in as a whole; leftover stamps carry over.
  return { ok: true, nextBalance: state.stamps - state.stampGoal }
}

/**
 * Serial numbers travel in a QR code, so a scan can pick up whitespace or a full URL.
 * Accepts a bare serial or any URL ending in `/s/<serial>`.
 */
export function extractSerial(scanned: string): string | null {
  const trimmed = scanned.trim()
  if (trimmed.length === 0) return null

  const fromUrl = /\/s\/([A-Za-z0-9._-]{4,64})\/?$/.exec(trimmed)
  if (fromUrl?.[1]) return fromUrl[1].toUpperCase()

  if (/^[A-Za-z0-9._-]{4,64}$/.test(trimmed)) return trimmed.toUpperCase()

  return null
}

export function formatCooldown(ms: number): string {
  const seconds = Math.ceil(ms / 1000)
  return seconds >= 60 ? `${Math.ceil(seconds / 60)} Minuten` : `${seconds} Sekunden`
}
