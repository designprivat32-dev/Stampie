import { beforeEach, describe, expect, it, vi } from 'vitest'

const contactFindFirst = vi.fn()
const passFindFirst = vi.fn()
const passCreate = vi.fn()
const eventCreate = vi.fn()
vi.mock('@/lib/db', () => ({
  prisma: {
    businessContact: { findFirst: (...a: unknown[]) => contactFindFirst(...a) },
    issuedPass: {
      findFirst: (...a: unknown[]) => passFindFirst(...a),
      create: (...a: unknown[]) => passCreate(...a),
    },
    businessCardEvent: { create: (...a: unknown[]) => eventCreate(...a) },
  },
}))

const loadPublishedDesign = vi.fn()
vi.mock('@/lib/cards/repository', () => ({
  loadPublishedDesign: (...a: unknown[]) => loadPublishedDesign(...a),
}))
vi.mock('@/lib/cards/asset-service', () => ({
  loadPassAssets: async () => ({ icon: null, logo: null }),
}))
vi.mock('@/lib/pass/apple-passkit-auth', () => ({ ensureAppleAuthToken: async () => 'tok' }))

const buildBusinessApplePass = vi.fn()
vi.mock('@/lib/business-cards/apple-pass-builder', () => ({
  buildBusinessApplePass: (...a: unknown[]) => buildBusinessApplePass(...a),
}))

const {
  buildIssuedBusinessPass,
  issueHolderPass,
  issueOwnerPass,
  recordBusinessCardEvent,
  resolveOwnerClaim,
  resolveScanCode,
} = await import('@/lib/business-cards/scan-service')

const CODE = 'abcdefghijklmnopqrstuv'

const row = {
  id: 'contact-1',
  cardId: 'card-1',
  scanCode: CODE,
  firstName: 'Anna',
  lastName: 'Schmidt',
  jobTitle: 'Vertrieb',
  phone: '+49 40 1',
  mobile: null,
  email: 'anna@example.de',
  links: [],
  card: {
    name: 'Nordlicht Karten',
    businessCompany: {
      company: 'Nordlicht GmbH',
      website: 'https://nordlicht.example/',
      phone: null,
      street: null,
      postalCode: null,
      city: 'Hamburg',
    },
    org: null,
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  contactFindFirst.mockResolvedValue(row)
  loadPublishedDesign.mockResolvedValue({ backgroundColor: '#000000' })
  passCreate.mockResolvedValue({ serial: 'V-NEW' })
  buildBusinessApplePass.mockResolvedValue(Buffer.from('pkpass'))
})

describe('resolveScanCode', () => {
  it('resolves a person with company data', async () => {
    const card = await resolveScanCode(CODE)
    expect(card).toMatchObject({
      cardId: 'card-1',
      contactId: 'contact-1',
      contact: { firstName: 'Anna', lastName: 'Schmidt' },
      company: { company: 'Nordlicht GmbH' },
      // Ohne Kunde fällt der Verantwortliche auf die Firmendaten zurück.
      owner: { name: 'Nordlicht GmbH', city: 'Hamburg' },
    })
  })

  it('only looks at business cards', async () => {
    await resolveScanCode(CODE)
    expect(contactFindFirst.mock.calls[0]![0].where).toEqual({
      scanCode: CODE,
      deletedAt: null,
      card: { kind: 'BUSINESS_CARD' },
    })
  })

  it.each(['', 'kurz', '../../../../etc/passwd'])('rejects %j without asking the database', async (code) => {
    expect(await resolveScanCode(code)).toBeNull()
    expect(contactFindFirst).not.toHaveBeenCalled()
  })

  it('hands out nothing while the design is unpublished', async () => {
    loadPublishedDesign.mockResolvedValue(null)
    expect(await resolveScanCode(CODE)).toBeNull()
  })

  it('returns null for an unknown code', async () => {
    contactFindFirst.mockResolvedValue(null)
    expect(await resolveScanCode(CODE)).toBeNull()
  })
})

describe('resolveOwnerClaim', () => {
  it('looks the person up by claim token', async () => {
    await resolveOwnerClaim(CODE)
    expect(contactFindFirst.mock.calls[0]![0].where).toEqual({
      ownerClaimToken: CODE,
      deletedAt: null,
      card: { kind: 'BUSINESS_CARD' },
    })
  })
})

describe('issuing passes', () => {
  it('creates a fresh recipient pass on every scan', async () => {
    const card = (await resolveScanCode(CODE))!
    expect(await issueHolderPass(card)).toBe('V-NEW')
    expect(passCreate.mock.calls[0]![0].data).toMatchObject({
      cardId: 'card-1',
      contactId: 'contact-1',
      kind: 'BUSINESS_CARD',
      role: 'HOLDER',
    })
    expect(passCreate.mock.calls[0]![0].data.serial).toMatch(/^V-/)
    // Keine Wiedererkennung, keine Einwilligung — nichts davon wird gespeichert.
    expect(passCreate.mock.calls[0]![0].data).not.toHaveProperty('deviceKey')
    expect(passFindFirst).not.toHaveBeenCalled()
  })

  it('hands the owner the same pass again instead of a second one', async () => {
    passFindFirst.mockResolvedValue({ serial: 'V-OWNER' })
    const card = (await resolveOwnerClaim(CODE))!
    expect(await issueOwnerPass(card)).toBe('V-OWNER')
    expect(passCreate).not.toHaveBeenCalled()
  })

  it('creates the owner pass once', async () => {
    passFindFirst.mockResolvedValue(null)
    const card = (await resolveOwnerClaim(CODE))!
    expect(await issueOwnerPass(card)).toBe('V-NEW')
    expect(passCreate.mock.calls[0]![0].data).toMatchObject({ role: 'OWNER', contactId: 'contact-1' })
  })

  it('builds the pass with the scan page as QR target', async () => {
    const card = (await resolveScanCode(CODE))!
    await buildIssuedBusinessPass(card, 'V-NEW', 'OWNER')
    const input = buildBusinessApplePass.mock.calls[0]![0]
    expect(input.role).toBe('OWNER')
    expect(input.scanUrl).toMatch(new RegExp(`/v/${CODE}$`))
    expect(input.appleAuthToken).toBe('tok')
  })
})

describe('recordBusinessCardEvent', () => {
  it('stores the event', async () => {
    eventCreate.mockResolvedValue({})
    await recordBusinessCardEvent('contact-1', 'VIEWED', 'apple')
    expect(eventCreate).toHaveBeenCalledWith({
      data: { contactId: 'contact-1', kind: 'VIEWED', platform: 'apple' },
    })
  })

  it('never lets a failed count stop the pass', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    eventCreate.mockRejectedValue(new Error('db down'))
    await expect(recordBusinessCardEvent('contact-1', 'WALLET_ADDED', 'apple')).resolves.toBeUndefined()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
