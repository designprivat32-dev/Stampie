import { describe, expect, it } from 'vitest'
import {
  STAMP_COOLDOWN_MS,
  decideRedeem,
  decideStamp,
  extractSerial,
  formatCooldown,
} from '@/lib/cards/stamping'

const now = new Date('2026-08-04T12:00:00Z')

describe('decideStamp', () => {
  it('books the first stamp on a fresh card', () => {
    const d = decideStamp({ stamps: 0, stampGoal: 10, lastStampAt: null }, now)
    expect(d).toEqual({ ok: true, nextBalance: 1, completesCard: false })
  })

  it('flags the stamp that completes the card', () => {
    const d = decideStamp({ stamps: 9, stampGoal: 10, lastStampAt: null }, now)
    expect(d.ok && d.completesCard).toBe(true)
  })

  it('refuses to overfill', () => {
    const d = decideStamp({ stamps: 10, stampGoal: 10, lastStampAt: null }, now)
    expect(d).toEqual({ ok: false, reason: 'already_full' })
  })

  describe('cooldown — a double scan must not count twice', () => {
    it('blocks a second stamp within the window', () => {
      const d = decideStamp(
        { stamps: 3, stampGoal: 10, lastStampAt: new Date(now.getTime() - 5_000) },
        now,
      )
      expect(d.ok).toBe(false)
      expect(!d.ok && d.reason).toBe('cooldown')
      expect(!d.ok && d.reason === 'cooldown' && d.retryInMs).toBe(STAMP_COOLDOWN_MS - 5_000)
    })

    it('allows it once the window has passed', () => {
      const d = decideStamp(
        { stamps: 3, stampGoal: 10, lastStampAt: new Date(now.getTime() - STAMP_COOLDOWN_MS - 1) },
        now,
      )
      expect(d.ok).toBe(true)
    })

    it('treats the exact boundary as allowed', () => {
      const d = decideStamp(
        { stamps: 3, stampGoal: 10, lastStampAt: new Date(now.getTime() - STAMP_COOLDOWN_MS) },
        now,
      )
      expect(d.ok).toBe(true)
    })
  })
})

describe('decideRedeem', () => {
  it('refuses an incomplete card', () => {
    expect(decideRedeem({ stamps: 7, stampGoal: 10 })).toEqual({ ok: false, reason: 'not_full' })
  })

  it('empties a full card', () => {
    expect(decideRedeem({ stamps: 10, stampGoal: 10 })).toEqual({ ok: true, nextBalance: 0 })
  })

  it('carries surplus stamps over instead of discarding them', () => {
    // Can happen if the goal was lowered after the card was issued.
    expect(decideRedeem({ stamps: 12, stampGoal: 10 })).toEqual({ ok: true, nextBalance: 2 })
  })
})

describe('extractSerial', () => {
  it('reads a serial out of the scanned barcode URL', () => {
    expect(extractSerial('https://stemply-xi.vercel.app/s/TEST-RH0EJNHI')).toBe('TEST-RH0EJNHI')
  })

  it('tolerates a trailing slash and whitespace', () => {
    expect(extractSerial('  https://x.de/s/ABC123/  ')).toBe('ABC123')
  })

  it('accepts a bare serial typed by hand and upper-cases it', () => {
    expect(extractSerial('test-rh0ejnhi')).toBe('TEST-RH0EJNHI')
  })

  it.each([
    ['', 'empty'],
    ['   ', 'whitespace'],
    ['https://evil.example/', 'no serial'],
    ['ab', 'too short'],
    ['drop table issued_pass', 'spaces'],
    ['<script>alert(1)</script>', 'markup'],
  ])('rejects %s (%s)', (input) => {
    expect(extractSerial(input)).toBeNull()
  })
})

describe('formatCooldown', () => {
  it('reads in seconds below a minute', () => {
    expect(formatCooldown(15_000)).toBe('15 Sekunden')
  })

  it('rounds up to minutes above that', () => {
    expect(formatCooldown(90_000)).toBe('2 Minuten')
  })
})
