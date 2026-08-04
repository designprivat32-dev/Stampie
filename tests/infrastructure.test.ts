import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { z } from 'zod'
import { rateLimit, resetRateLimits } from '@/lib/rate-limit'
import { fail, fromZodError, guarded, ok } from '@/lib/action-result'
import { LocationAccessError, UnauthorizedError } from '@/lib/auth/session'
import { assetKey, variantKey } from '@/lib/storage'
import { FsStorageAdapter } from '@/lib/storage/fs-adapter'
import { getMailer, setMailer, testCardMail, type MailMessage } from '@/lib/mail'
import { extractPalette } from '@/lib/color/extract-palette'
import { contrastRatio } from '@/lib/color/contrast'

describe('rateLimit', () => {
  beforeEach(() => resetRateLimits())

  it('allows up to the limit and then blocks', () => {
    for (let i = 0; i < 5; i++) {
      expect(rateLimit('k', 5, 60_000).allowed).toBe(true)
    }
    expect(rateLimit('k', 5, 60_000).allowed).toBe(false)
  })

  it('counts down the remaining budget', () => {
    expect(rateLimit('k', 3, 60_000).remaining).toBe(2)
    expect(rateLimit('k', 3, 60_000).remaining).toBe(1)
    expect(rateLimit('k', 3, 60_000).remaining).toBe(0)
  })

  it('keeps buckets separate per key', () => {
    rateLimit('a', 1, 60_000)
    expect(rateLimit('a', 1, 60_000).allowed).toBe(false)
    expect(rateLimit('b', 1, 60_000).allowed).toBe(true)
  })

  it('resets after the window', () => {
    vi.useFakeTimers()
    try {
      rateLimit('k', 1, 1000)
      expect(rateLimit('k', 1, 1000).allowed).toBe(false)
      vi.advanceTimersByTime(1500)
      expect(rateLimit('k', 1, 1000).allowed).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('action result envelope', () => {
  it('wraps success and failure in the same shape', () => {
    expect(ok({ id: 1 })).toEqual({ success: true, data: { id: 1 }, error: null })
    expect(fail('kaputt', 'validation')).toEqual({
      success: false,
      data: null,
      error: { message: 'kaputt', code: 'validation' },
    })
  })

  it('maps Zod issues to field paths, first message wins', () => {
    const schema = z.object({ a: z.string().min(3, 'zu kurz'), nested: z.object({ b: z.number() }) })
    const parsed = schema.safeParse({ a: 'x', nested: { b: 'nope' } })
    expect(parsed.success).toBe(false)

    const result = fromZodError(parsed.error!)
    expect(result.success).toBe(false)
    expect(result.error.code).toBe('validation')
    expect(result.error.fields?.a).toBe('zu kurz')
    expect(result.error.fields?.['nested.b']).toBeDefined()
  })

  it('turns an auth failure into a typed envelope, not an exception', async () => {
    const result = await guarded(async () => {
      throw new UnauthorizedError()
    })
    expect(result.success).toBe(false)
    expect(result.success === false && result.error.code).toBe('forbidden')
  })

  it('reports a missing location as not_found so ids cannot be probed', async () => {
    const result = await guarded(async () => {
      throw new LocationAccessError()
    })
    expect(result.success === false && result.error.code).toBe('not_found')
  })

  it('never leaks an internal error message to the client', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await guarded(async () => {
      throw new Error('connection string postgres://user:hunter2@db')
    })
    expect(result.success).toBe(false)
    expect(JSON.stringify(result)).not.toContain('hunter2')
    expect(result.success === false && result.error.code).toBe('internal')
    spy.mockRestore()
  })
})

describe('storage keys', () => {
  it('scopes every asset under its card', () => {
    expect(assetKey('ccrd1', 'LOGO', 'casset1')).toBe('cards/ccrd1/logo/casset1')
  })

  it('names variants by scale', () => {
    expect(variantKey('locations/a/logo/b', 2)).toBe('locations/a/logo/b@2x.png')
  })
})

describe('FsStorageAdapter', () => {
  let root: string
  let adapter: FsStorageAdapter

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'stemply-storage-'))
    adapter = new FsStorageAdapter(root)
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('round-trips a buffer through nested keys', async () => {
    const data = Buffer.from('png-bytes')
    await adapter.put('locations/a/logo/b@1x.png', data, 'image/png')
    expect(await adapter.exists('locations/a/logo/b@1x.png')).toBe(true)
    expect((await adapter.get('locations/a/logo/b@1x.png'))?.equals(data)).toBe(true)
  })

  it('returns null for a missing key instead of throwing', async () => {
    expect(await adapter.get('nope/nope.png')).toBeNull()
    expect(await adapter.exists('nope/nope.png')).toBe(false)
  })

  it('deletes without complaining about a missing key', async () => {
    await adapter.put('a.png', Buffer.from('x'), 'image/png')
    await adapter.delete('a.png')
    await adapter.delete('a.png')
    expect(await adapter.exists('a.png')).toBe(false)
  })

  it('refuses to escape the storage root', async () => {
    await expect(adapter.put('../../escaped.png', Buffer.from('x'), 'image/png')).rejects.toThrow(
      'Invalid storage key',
    )
  })
})

describe('mail', () => {
  it('composes a German test-card mail with the link in both parts', () => {
    const mail = testCardMail('https://stemply.de/p/abc', 'Kaffeekarte')
    expect(mail.subject).toContain('Kaffeekarte')
    expect(mail.text).toContain('https://stemply.de/p/abc')
    expect(mail.html).toContain('https://stemply.de/p/abc')
    expect(mail.text).toContain('30 Minuten')
  })

  it('falls back to a generic name', () => {
    expect(testCardMail('https://x', '   ').subject).toContain('Stempelkarte')
  })

  it('escapes HTML in the program name', () => {
    const mail = testCardMail('https://x', '<script>alert(1)</script>')
    expect(mail.html).not.toContain('<script>')
    expect(mail.html).toContain('&lt;script&gt;')
  })

  it('is swappable', async () => {
    const sent: MailMessage[] = []
    const previous = getMailer()
    setMailer({ send: async (m) => void sent.push(m) })
    try {
      await getMailer().send({ to: 'a@b.de', subject: 's', text: 't', html: '<p>t</p>' })
      expect(sent).toHaveLength(1)
      expect(sent[0]!.to).toBe('a@b.de')
    } finally {
      setMailer(previous)
    }
  })
})

describe('extractPalette', () => {
  const solid = (hex: string, size = 64) =>
    sharp({ create: { width: size, height: size, channels: 4, background: hex } })
      .png()
      .toBuffer()

  it('finds the dominant brand colour of a solid logo', async () => {
    const palette = await extractPalette(await solid('#8c1c13'))
    expect(palette.colors.length).toBeGreaterThan(0)
    // Bucketed averaging shifts the value slightly; assert it is the same red.
    expect(contrastRatio(palette.colors[0]!, '#8c1c13')).toBeLessThan(1.6)
  })

  it('recommends a readable combination', async () => {
    const palette = await extractPalette(await solid('#8c1c13'))
    const { backgroundColor, foregroundColor, labelColor } = palette.recommended
    expect(contrastRatio(foregroundColor, backgroundColor)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(labelColor, backgroundColor)).toBeGreaterThanOrEqual(4.5)
  })

  it('ignores greys and whites — they are background, not brand', async () => {
    const palette = await extractPalette(await solid('#f4f4f4'))
    expect(palette.colors).toHaveLength(0)
    // With no usable chroma it falls back to the neutral look rather than failing.
    expect(palette.recommended.backgroundColor).toBe('#1a1a1a')
    expect(palette.recommended.foregroundColor).toBe('#ffffff')
  })

  it('ranks by frequency', async () => {
    // Two-thirds red, one-third blue.
    const image = await sharp({
      create: { width: 60, height: 60, channels: 4, background: '#c02020' },
    })
      .composite([
        {
          input: await sharp({
            create: { width: 60, height: 20, channels: 4, background: '#2040c0' },
          })
            .png()
            .toBuffer(),
          top: 40,
          left: 0,
        },
      ])
      .png()
      .toBuffer()

    const palette = await extractPalette(image)
    expect(palette.colors.length).toBeGreaterThanOrEqual(2)
    const first = palette.colors[0]!
    expect(contrastRatio(first, '#c02020')).toBeLessThan(1.6)
  })

  it('honours the max count', async () => {
    const palette = await extractPalette(await solid('#8c1c13'), 2)
    expect(palette.colors.length).toBeLessThanOrEqual(2)
  })
})
