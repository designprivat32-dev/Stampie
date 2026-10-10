import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Apples Update-Abruf geht für alle Pässe über `rebuildIssuedPass`. Visitenkarten müssen
 * dort in ihren eigenen Bauweg abzweigen — und Stempelkarten dürfen davon nichts merken.
 */

const passFindFirst = vi.fn()
vi.mock('@/lib/db', () => ({
  prisma: { issuedPass: { findFirst: (...a: unknown[]) => passFindFirst(...a) } },
}))

const buildApplePass = vi.fn()
vi.mock('@/lib/pass/mock-pass-builder', () => ({
  getPassBuilder: () => ({ buildApplePass: (...a: unknown[]) => buildApplePass(...a) }),
}))

const buildBusinessApplePass = vi.fn()
vi.mock('@/lib/business-cards/apple-pass-builder', () => ({
  buildBusinessApplePass: (...a: unknown[]) => buildBusinessApplePass(...a),
}))

vi.mock('@/lib/cards/asset-service', () => ({
  loadPassAssets: async () => ({ icon: null, logo: null }),
}))
vi.mock('@/lib/pass/apple-passkit-auth', () => ({ ensureAppleAuthToken: async () => 'tok' }))
vi.mock('@/lib/cards/repository', () => ({
  loadPublishedDesign: async () => ({ stampGoal: 10, stampLabel: 'Stempel' }),
  loadOrCreateDraft: async () => ({ design: {} }),
}))

const { rebuildIssuedPass } = await import('@/lib/cards/pass-rebuild')

const businessPass = {
  serial: 'V-ABC',
  role: 'HOLDER',
  cardId: 'c1',
  contact: {
    firstName: 'Anna',
    lastName: 'Schmidt',
    jobTitle: null,
    phone: '+49 40 1',
    mobile: null,
    email: null,
    links: [],
    scanCode: 'code123',
  },
  card: { businessCompany: null },
}

beforeEach(() => {
  vi.clearAllMocks()
  buildApplePass.mockResolvedValue(Buffer.from('stamp'))
  buildBusinessApplePass.mockResolvedValue(Buffer.from('business'))
})

describe('rebuildIssuedPass dispatch', () => {
  it('hands V- serials to the business card builder', async () => {
    passFindFirst.mockResolvedValue(businessPass)

    const result = await rebuildIssuedPass('V-ABC')

    expect(result?.toString()).toBe('business')
    expect(buildApplePass).not.toHaveBeenCalled()
    const where = passFindFirst.mock.calls[0]![0].where
    expect(where).toMatchObject({
      serial: 'V-ABC',
      kind: 'BUSINESS_CARD',
      card: { kind: 'BUSINESS_CARD' },
    })
    const input = buildBusinessApplePass.mock.calls[0]![0]
    expect(input.role).toBe('HOLDER')
    expect(input.scanUrl).toMatch(/\/v\/code123$/)
    expect(input.privacyUrl).toMatch(/\/v\/code123\/datenschutz$/)
    expect(input.contact.firstName).toBe('Anna')
    expect(input.appleAuthToken).toBe('tok')
  })

  it('keeps stamp cards on their own path', async () => {
    passFindFirst.mockResolvedValue({
      serial: 'K-1',
      stamps: 2,
      stampGoal: 10,
      kind: 'STAMP',
      cardId: 'c1',
      activeMessage: null,
      marketingConsentAt: null,
      card: { name: 'Karte', org: { name: 'Café' } },
    })

    const result = await rebuildIssuedPass('K-1')

    expect(result?.toString()).toBe('stamp')
    expect(buildBusinessApplePass).not.toHaveBeenCalled()
  })

  it('builds nothing for a business serial that does not resolve', async () => {
    passFindFirst.mockResolvedValue(null)
    expect(await rebuildIssuedPass('V-WEG')).toBeNull()
    expect(buildBusinessApplePass).not.toHaveBeenCalled()
  })

  it('builds nothing for a business pass without a person', async () => {
    passFindFirst.mockResolvedValue({ ...businessPass, contact: null })
    expect(await rebuildIssuedPass('V-ABC')).toBeNull()
  })
})
