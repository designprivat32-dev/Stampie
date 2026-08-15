import { beforeEach, describe, expect, it, vi } from 'vitest'

const findFirst = vi.fn()
const update = vi.fn()

vi.mock('@/lib/db', () => ({
  prisma: {
    issuedPass: {
      findFirst: (...a: unknown[]) => findFirst(...a),
      update: (...a: unknown[]) => update(...a),
    },
  },
}))

const PASS_TYPE_ID = 'pass.de.stampie.test'
vi.mock('@/lib/pass/pass-builder', () => ({
  readPassBuilderConfig: () => ({
    passTypeIdentifier: PASS_TYPE_ID,
    teamIdentifier: 'A1B2C3D4E5',
    appUrl: 'https://example.test',
    googleIssuerId: '1234567890123',
  }),
}))

const { ensureAppleAuthToken, verifyApplePassAuth } = await import(
  '@/lib/pass/apple-passkit-auth'
)
const { buildPassJson } = await import('@/lib/cards/apple-pass-json')
const { DEFAULT_CARD_DESIGN } = await import('@/lib/cards/defaults')

beforeEach(() => {
  findFirst.mockReset()
  update.mockReset()
})

/**
 * The only thing standing between a stranger and someone else's pass. Apple sends the
 * token the pass was built with; every call that changes or reveals a pass is gated on it.
 */
describe('verifyApplePassAuth', () => {
  it('accepts the token the pass was built with', async () => {
    findFirst.mockResolvedValue({ id: 'p1', cardId: 'c1' })

    const result = await verifyApplePassAuth(PASS_TYPE_ID, 'K-1', 'ApplePass secret-token')

    expect(result).toEqual({ id: 'p1', cardId: 'c1' })
    expect(findFirst.mock.calls[0]?.[0].where).toMatchObject({
      serial: 'K-1',
      appleAuthToken: 'secret-token',
    })
  })

  it('rejects a pass type identifier that is not ours, without touching the database', async () => {
    expect(await verifyApplePassAuth('pass.de.someone.else', 'K-1', 'ApplePass t')).toBeNull()
    expect(findFirst).not.toHaveBeenCalled()
  })

  it('rejects a missing or malformed Authorization header', async () => {
    expect(await verifyApplePassAuth(PASS_TYPE_ID, 'K-1', null)).toBeNull()
    expect(await verifyApplePassAuth(PASS_TYPE_ID, 'K-1', 'Bearer secret-token')).toBeNull()
    expect(await verifyApplePassAuth(PASS_TYPE_ID, 'K-1', 'secret-token')).toBeNull()
    expect(findFirst).not.toHaveBeenCalled()
  })

  it('rejects a token belonging to a different pass', async () => {
    // The query pairs serial and token, so a valid token for another pass finds nothing.
    findFirst.mockResolvedValue(null)

    expect(await verifyApplePassAuth(PASS_TYPE_ID, 'K-2', 'ApplePass token-of-K-1')).toBeNull()
  })
})

describe('ensureAppleAuthToken', () => {
  it('mints a token on first use', async () => {
    findFirst.mockResolvedValue({ id: 'p1', appleAuthToken: null })
    update.mockResolvedValue({})

    const token = await ensureAppleAuthToken('K-1')

    expect(token).toMatch(/^[A-Za-z0-9_-]{20,}$/)
    expect(update.mock.calls[0]?.[0].data.appleAuthToken).toBe(token)
  })

  it('keeps the existing token — rotating it would lock the pass out of its own updates', async () => {
    findFirst.mockResolvedValue({ id: 'p1', appleAuthToken: 'already-set' })

    expect(await ensureAppleAuthToken('K-1')).toBe('already-set')
    expect(update).not.toHaveBeenCalled()
  })

  it('returns null for an unknown serial', async () => {
    findFirst.mockResolvedValue(null)

    expect(await ensureAppleAuthToken('K-nope')).toBeNull()
    expect(update).not.toHaveBeenCalled()
  })
})

/**
 * Half a web service is worse than none: a `webServiceURL` without a token would let
 * anyone who guesses the URL ask about passes, so the two fields travel together.
 */
describe('the pass.json web service fields', () => {
  const ctx = {
    serial: 'K-1',
    currentStamps: 3,
    organizationName: 'Café Nord',
    passTypeIdentifier: PASS_TYPE_ID,
    teamIdentifier: 'A1B2C3D4E5',
    barcodeMessage: 'https://example.test/s/K-1',
  }

  it('are both present when a web service is configured', () => {
    const pass = buildPassJson(DEFAULT_CARD_DESIGN, {
      ...ctx,
      webService: { url: 'https://example.test/api/apple-passkit', authenticationToken: 'tok' },
    })

    expect(pass.webServiceURL).toBe('https://example.test/api/apple-passkit')
    expect(pass.authenticationToken).toBe('tok')
  })

  it('are both absent otherwise', () => {
    const pass = buildPassJson(DEFAULT_CARD_DESIGN, { ...ctx, webService: null })

    expect(pass.webServiceURL).toBeUndefined()
    expect(pass.authenticationToken).toBeUndefined()
  })
})
