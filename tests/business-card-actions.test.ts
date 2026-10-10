import { beforeEach, describe, expect, it, vi } from 'vitest'

const cardFindFirst = vi.fn()
const contactFindFirst = vi.fn()
const contactCount = vi.fn()
const contactCreate = vi.fn()
const contactUpdate = vi.fn()
const contactDelete = vi.fn()
const companyUpsert = vi.fn()
const assetFindFirst = vi.fn()
const passFindMany = vi.fn()

vi.mock('@/lib/db', () => ({
  prisma: {
    card: { findFirst: (...a: unknown[]) => cardFindFirst(...a) },
    businessContact: {
      findFirst: (...a: unknown[]) => contactFindFirst(...a),
      count: (...a: unknown[]) => contactCount(...a),
      create: (...a: unknown[]) => contactCreate(...a),
      update: (...a: unknown[]) => contactUpdate(...a),
      delete: (...a: unknown[]) => contactDelete(...a),
    },
    businessCardCompany: { upsert: (...a: unknown[]) => companyUpsert(...a) },
    asset: { findFirst: (...a: unknown[]) => assetFindFirst(...a) },
    issuedPass: { findMany: (...a: unknown[]) => passFindMany(...a) },
  },
}))

const assertCardAccess = vi.fn()
vi.mock('@/lib/auth/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/session')>()),
  assertCardAccess: (...a: unknown[]) => assertCardAccess(...a),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

const saveDraft = vi.fn()
const publishDesign = vi.fn()
vi.mock('@/lib/cards/repository', async () => {
  const { DEFAULT_CARD_DESIGN } = await import('@/lib/cards/defaults')
  return {
    loadOrCreateDraft: async () => ({ design: DEFAULT_CARD_DESIGN }),
    saveDraft: (...a: unknown[]) => saveDraft(...a),
    publishDesign: (...a: unknown[]) => publishDesign(...a),
  }
})
vi.mock('@/lib/cards/strip-service', () => ({ invalidateStripCache: () => {} }))

const pushForCard = vi.fn()
const pushForPasses = vi.fn()
vi.mock('@/lib/business-cards/wallet-sync', () => ({
  syncBusinessCard: (...a: unknown[]) => pushForCard(...a),
  syncBusinessContact: (...a: unknown[]) => pushForPasses(...a),
}))

const {
  createContactAction,
  deleteContactAction,
  renewOwnerLinkAction,
  saveBusinessCompanyAction,
  saveBusinessDesignAction,
  updateContactAction,
} = await import('@/actions/business-cards')

const CARD = 'ckcard00000000000000000001'
const CONTACT = 'ckcont00000000000000000001'

beforeEach(() => {
  vi.clearAllMocks()
  assertCardAccess.mockResolvedValue({ session: { userId: 'u1' }, cardId: CARD, orgId: 'o1' })
  cardFindFirst.mockResolvedValue({ id: CARD })
  contactFindFirst.mockResolvedValue({ cardId: CARD })
  contactCount.mockResolvedValue(2)
  contactCreate.mockResolvedValue({ id: CONTACT })
  publishDesign.mockResolvedValue({ version: 3 })
  passFindMany.mockResolvedValue([{ serial: 'V-1' }, { serial: 'V-2' }])
  pushForCard.mockResolvedValue({})
  pushForPasses.mockResolvedValue({})
})

describe('access', () => {
  it('refuses a card that is not a business card', async () => {
    cardFindFirst.mockResolvedValue(null)
    const result = await saveBusinessCompanyAction({ cardId: CARD, company: 'X' })
    expect(result.success).toBe(false)
    expect(result.error?.code).toBe('not_found')
    expect(companyUpsert).not.toHaveBeenCalled()
    expect(cardFindFirst.mock.calls[0]![0].where).toEqual({ id: CARD, kind: 'BUSINESS_CARD' })
  })

  it('refuses when the caller has no access to the card', async () => {
    const { CardAccessError } = await import('@/lib/auth/session')
    assertCardAccess.mockRejectedValue(new CardAccessError())
    const result = await createContactAction({ cardId: CARD, firstName: 'A', lastName: 'B' })
    expect(result.success).toBe(false)
    expect(contactCreate).not.toHaveBeenCalled()
  })

  it('checks access through the contact’s own card', async () => {
    await renewOwnerLinkAction(CONTACT)
    expect(assertCardAccess).toHaveBeenCalledWith(CARD)
  })
})

describe('saveBusinessDesignAction', () => {
  it('saves and publishes in one go, then nudges the wallets', async () => {
    const result = await saveBusinessDesignAction({
      cardId: CARD,
      backgroundColor: '#112233',
      foregroundColor: '#ffffff',
      labelColor: '#cccccc',
      cardTitle: 'NL',
      logoAssetId: null,
    })
    expect(result).toMatchObject({ success: true, data: { version: 3 } })
    expect(saveDraft.mock.calls[0]![1]).toMatchObject({ backgroundColor: '#112233', cardTitle: 'NL' })
    expect(publishDesign).toHaveBeenCalled()
    expect(pushForCard).toHaveBeenCalledWith(CARD)
  })

  it('refuses a logo that belongs to another card', async () => {
    assetFindFirst.mockResolvedValue(null)
    const result = await saveBusinessDesignAction({
      cardId: CARD,
      backgroundColor: '#112233',
      foregroundColor: '#ffffff',
      labelColor: '#cccccc',
      cardTitle: null,
      logoAssetId: 'ckasset0000000000000000001',
    })
    expect(result.success).toBe(false)
    expect(assetFindFirst.mock.calls[0]![0].where).toMatchObject({ cardId: CARD, kind: 'LOGO' })
    expect(publishDesign).not.toHaveBeenCalled()
  })

  it('rejects colours that are not hex', async () => {
    const result = await saveBusinessDesignAction({
      cardId: CARD,
      backgroundColor: 'red',
      foregroundColor: '#ffffff',
      labelColor: '#cccccc',
      cardTitle: null,
      logoAssetId: null,
    })
    expect(result.success).toBe(false)
  })
})

describe('saveBusinessCompanyAction', () => {
  it('normalizes and upserts', async () => {
    const result = await saveBusinessCompanyAction({ cardId: CARD, company: ' Nordlicht ', website: 'nordlicht.de' })
    expect(result.success).toBe(true)
    expect(companyUpsert.mock.calls[0]![0]).toMatchObject({
      where: { cardId: CARD },
      update: { company: 'Nordlicht', website: 'https://nordlicht.de/' },
    })
    expect(pushForCard).toHaveBeenCalledWith(CARD)
  })

  it('keeps the save when the wallet push fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    pushForCard.mockRejectedValue(new Error('apns down'))
    const result = await saveBusinessCompanyAction({ cardId: CARD, company: 'X' })
    expect(result.success).toBe(true)
    spy.mockRestore()
  })
})

describe('contacts', () => {
  it('creates a person with its own scan code and owner link', async () => {
    const result = await createContactAction({ cardId: CARD, firstName: 'Anna', lastName: 'Schmidt' })
    expect(result).toMatchObject({ success: true, data: { contactId: CONTACT } })
    const data = contactCreate.mock.calls[0]![0].data
    expect(data).toMatchObject({ cardId: CARD, firstName: 'Anna', sortOrder: 2 })
    expect(data.scanCode).toMatch(/^[A-Za-z0-9_-]{16,}$/)
    expect(data.ownerClaimToken).toMatch(/^[A-Za-z0-9_-]{32,}$/)
    expect(data.scanCode).not.toBe(data.ownerClaimToken)
  })

  it('reports field errors for bad input', async () => {
    const result = await createContactAction({ cardId: CARD, firstName: 'A', lastName: 'B', email: 'x' })
    expect(result.success).toBe(false)
    expect(result.error?.fields?.email).toBeDefined()
  })

  it('updates a person and pushes only their passes', async () => {
    const result = await updateContactAction({ contactId: CONTACT, firstName: 'Anna', lastName: 'Meier' })
    expect(result.success).toBe(true)
    expect(contactUpdate.mock.calls[0]![0]).toMatchObject({ where: { id: CONTACT }, data: { lastName: 'Meier' } })
    expect(pushForPasses).toHaveBeenCalledWith(CONTACT)
    expect(pushForCard).not.toHaveBeenCalled()
  })

  it('renews the owner link', async () => {
    await renewOwnerLinkAction(CONTACT)
    expect(contactUpdate.mock.calls[0]![0].data.ownerClaimToken).toMatch(/^[A-Za-z0-9_-]{32,}$/)
  })

  it('soft-deletes a person and voids their passes', async () => {
    const result = await deleteContactAction(CONTACT)
    expect(result.success).toBe(true)
    expect(contactDelete).not.toHaveBeenCalled()
    const update = contactUpdate.mock.calls[0]![0]
    expect(update.where).toEqual({ id: CONTACT })
    expect(update.data.deletedAt).toBeInstanceOf(Date)
    expect(update.data.ownerClaimToken).toBeNull()
    expect(pushForPasses).toHaveBeenCalledWith(CONTACT)
  })

  it('ignores people that are already deleted', async () => {
    await deleteContactAction(CONTACT)
    expect(contactFindFirst.mock.calls[0]![0].where).toEqual({ id: CONTACT, deletedAt: null })
  })

  it('renews the scan code and updates the passes', async () => {
    const { renewScanCodeAction } = await import('@/actions/business-cards')
    const result = await renewScanCodeAction(CONTACT)
    expect(result.success).toBe(true)
    expect(contactUpdate.mock.calls[0]![0].data.scanCode).toMatch(/^[A-Za-z0-9_-]{16,}$/)
    expect(pushForPasses).toHaveBeenCalledWith(CONTACT)
  })

  it('reports a missing person as not found', async () => {
    contactFindFirst.mockResolvedValue(null)
    const result = await deleteContactAction(CONTACT)
    expect(result.success).toBe(false)
    expect(contactDelete).not.toHaveBeenCalled()
  })
})
