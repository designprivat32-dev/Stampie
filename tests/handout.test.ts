import { beforeEach, describe, expect, it, vi } from 'vitest'

const findFirst = vi.fn()
const create = vi.fn()
const cardFindFirst = vi.fn()
const loadPublishedDesign = vi.fn()

vi.mock('@/lib/db', () => ({
  prisma: {
    issuedPass: { findFirst: (...a: unknown[]) => findFirst(...a), create: (...a: unknown[]) => create(...a) },
    card: { findFirst: (...a: unknown[]) => cardFindFirst(...a) },
  },
}))
vi.mock('@/lib/cards/repository', () => ({
  loadPublishedDesign: (...a: unknown[]) => loadPublishedDesign(...a),
}))
vi.mock('@/lib/cards/asset-service', () => ({ loadPassAssets: async () => ({}) }))

const {
  issuePassForDevice,
  newDeviceKey,
  newNfcCode,
  resolveHandoutCode,
} = await import('@/lib/cards/handout-service')

const { DEFAULT_CARD_DESIGN } = await import('@/lib/cards/defaults')

const resolved = {
  cardId: 'ccard0000000000000000001',
  kind: 'STAMP' as const,
  organizationName: 'Café Nord',
  design: { ...DEFAULT_CARD_DESIGN, stampGoal: 10 },
}

beforeEach(() => {
  findFirst.mockReset()
  create.mockReset()
  cardFindFirst.mockReset()
  loadPublishedDesign.mockReset()
})

/**
 * The rule the whole NFC flow hangs on: one card per phone, not one card per tap. Getting
 * it wrong is not a crash — the customer quietly collects stamps on two cards and notices
 * when neither is full.
 */
describe('issuePassForDevice', () => {
  it('creates a pass on the first tap', async () => {
    findFirst.mockResolvedValue(null)
    create.mockResolvedValue({ serial: 'K-ABCDEF' })

    const result = await issuePassForDevice(resolved, 'device-1')

    expect(result).toEqual({ serial: 'K-ABCDEF', currentStamps: 0, created: true })
    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0]?.[0].data).toMatchObject({
      cardId: resolved.cardId,
      deviceKey: 'device-1',
      stamps: 0,
      stampGoal: 10,
    })
  })

  it('returns the existing pass on a second tap, stamps and all', async () => {
    findFirst.mockResolvedValue({ serial: 'K-ABCDEF', stamps: 4 })

    const result = await issuePassForDevice(resolved, 'device-1')

    expect(result).toEqual({ serial: 'K-ABCDEF', currentStamps: 4, created: false })
    expect(create).not.toHaveBeenCalled()
  })

  it('never mistakes a dashboard test card for the customer\'s own', async () => {
    findFirst.mockResolvedValue(null)
    create.mockResolvedValue({ serial: 'K-ABCDEF' })

    await issuePassForDevice(resolved, 'device-1')

    expect(findFirst.mock.calls[0]?.[0].where).toMatchObject({ isTest: false })
  })

  it('keeps different phones apart', async () => {
    findFirst.mockResolvedValue(null)
    create.mockResolvedValue({ serial: 'K-111111' })
    await issuePassForDevice(resolved, 'device-1')
    await issuePassForDevice(resolved, 'device-2')

    expect(create).toHaveBeenCalledTimes(2)
    expect(findFirst.mock.calls[0]?.[0].where.deviceKey).toBe('device-1')
    expect(findFirst.mock.calls[1]?.[0].where.deviceKey).toBe('device-2')
  })
})

describe('resolveHandoutCode', () => {
  it('rejects codes that cannot be real before hitting the database', async () => {
    expect(await resolveHandoutCode('')).toBeNull()
    expect(await resolveHandoutCode('short')).toBeNull()
    expect(await resolveHandoutCode('x'.repeat(200))).toBeNull()
    expect(cardFindFirst).not.toHaveBeenCalled()
  })

  it('hands out nothing for a card that was never published', async () => {
    cardFindFirst.mockResolvedValue({ id: 'c1', name: 'Karte', kind: 'STAMP', org: null })
    loadPublishedDesign.mockResolvedValue(null)

    expect(await resolveHandoutCode('a'.repeat(22))).toBeNull()
  })

  it('ignores archived cards', async () => {
    cardFindFirst.mockResolvedValue(null)

    expect(await resolveHandoutCode('a'.repeat(22))).toBeNull()
    expect(cardFindFirst.mock.calls[0]?.[0].where).toMatchObject({ archivedAt: null })
  })

  it('falls back to the card name when no customer is assigned', async () => {
    cardFindFirst.mockResolvedValue({ id: 'c1', name: 'Kaffeekarte', kind: 'STAMP', org: null })
    loadPublishedDesign.mockResolvedValue(DEFAULT_CARD_DESIGN)

    const result = await resolveHandoutCode('a'.repeat(22))
    expect(result?.organizationName).toBe('Kaffeekarte')
  })
})

describe('the public codes', () => {
  it('are URL-safe and long enough not to be guessed', () => {
    for (const code of [newNfcCode(), newDeviceKey()]) {
      expect(code).toMatch(/^[A-Za-z0-9_-]+$/)
      expect(code.length).toBeGreaterThanOrEqual(20)
    }
  })

  it('do not repeat', () => {
    const codes = new Set(Array.from({ length: 200 }, () => newNfcCode()))
    expect(codes.size).toBe(200)
  })
})
