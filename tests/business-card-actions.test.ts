import { beforeEach, describe, expect, it, vi } from 'vitest'

const cardFindFirst = vi.fn()
const contactFindFirst = vi.fn()
const contactFindMany = vi.fn()
const contactCreate = vi.fn()
const contactUpdate = vi.fn()
const contactUpdateMany = vi.fn()
const companyFindFirst = vi.fn()
const companyUpsert = vi.fn()
const companyDeleteMany = vi.fn()
const assetFindFirst = vi.fn()
const assetFindMany = vi.fn()

const db = {
  card: { findFirst: (...a: unknown[]) => cardFindFirst(...a) },
  businessContact: {
    findFirst: (...a: unknown[]) => contactFindFirst(...a),
    findMany: (...a: unknown[]) => contactFindMany(...a),
    create: (...a: unknown[]) => contactCreate(...a),
    update: (...a: unknown[]) => contactUpdate(...a),
    updateMany: (...a: unknown[]) => contactUpdateMany(...a),
  },
  businessCardCompany: {
    findFirst: (...a: unknown[]) => companyFindFirst(...a),
    upsert: (...a: unknown[]) => companyUpsert(...a),
    deleteMany: (...a: unknown[]) => companyDeleteMany(...a),
  },
  asset: {
    findFirst: (...a: unknown[]) => assetFindFirst(...a),
    findMany: (...a: unknown[]) => assetFindMany(...a),
  },
}
vi.mock('@/lib/db', () => ({
  prisma: { ...db, $transaction: async (fn: (tx: typeof db) => Promise<unknown>) => fn(db) },
}))

const assertCardAccess = vi.fn()
vi.mock('@/lib/auth/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/session')>()),
  assertCardAccess: (...a: unknown[]) => assertCardAccess(...a),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

const saveDraft = vi.fn()
const publishDesign = vi.fn()
const loadPublishedDesign = vi.fn()
vi.mock('@/lib/cards/repository', async () => {
  const { DEFAULT_CARD_DESIGN } = await import('@/lib/cards/defaults')
  return {
    loadOrCreateDraft: async () => ({ design: DEFAULT_CARD_DESIGN, publishedVersion: 2 }),
    loadPublishedDesign: (...a: unknown[]) => loadPublishedDesign(...a),
    saveDraft: (...a: unknown[]) => saveDraft(...a),
    publishDesign: (...a: unknown[]) => publishDesign(...a),
  }
})
vi.mock('@/lib/cards/strip-service', () => ({ invalidateStripCache: () => {} }))

const syncCard = vi.fn()
const syncContact = vi.fn()
vi.mock('@/lib/business-cards/wallet-sync', () => ({
  syncBusinessCard: (...a: unknown[]) => syncCard(...a),
  syncBusinessContact: (...a: unknown[]) => syncContact(...a),
}))

const { saveBusinessCardAction, renewOwnerLinkAction, renewScanCodeAction } = await import('@/actions/business-cards')
const { DEFAULT_CARD_DESIGN } = await import('@/lib/cards/defaults')

const CARD = 'ckcard00000000000000000001'
const ANNA = 'ckcont00000000000000000001'
const BEN = 'ckcont00000000000000000002'

const design = {
  backgroundColor: DEFAULT_CARD_DESIGN.backgroundColor,
  foregroundColor: DEFAULT_CARD_DESIGN.foregroundColor,
  labelColor: DEFAULT_CARD_DESIGN.labelColor,
  cardTitle: '',
  logoAssetId: null,
}
const company = { company: 'Nordlicht GmbH', website: null, phone: null, street: null, postalCode: null, city: null }
const annaRow = {
  id: ANNA,
  firstName: 'Anna',
  lastName: 'Schmidt',
  jobTitle: null,
  phone: null,
  mobile: null,
  email: null,
  links: [],
  photoAssetId: null,
}
const anna = { id: ANNA, key: ANNA, firstName: 'Anna', lastName: 'Schmidt', links: [] }

function input(over: Record<string, unknown> = {}) {
  return { cardId: CARD, design, company, contacts: [anna], deletedContactIds: [], ...over }
}

beforeEach(() => {
  vi.clearAllMocks()
  assertCardAccess.mockResolvedValue({ session: { userId: 'u1' }, cardId: CARD, orgId: 'o1' })
  cardFindFirst.mockResolvedValue({ id: CARD })
  contactFindFirst.mockResolvedValue({ cardId: CARD })
  contactFindMany.mockResolvedValue([annaRow])
  contactCreate.mockResolvedValue({ id: BEN })
  companyFindFirst.mockResolvedValue(company)
  assetFindMany.mockResolvedValue([])
  // Veröffentlicht ist genau das, was der Editor schickt: nichts geändert.
  loadPublishedDesign.mockResolvedValue({ ...DEFAULT_CARD_DESIGN, cardTitle: null, logoAssetId: null })
  publishDesign.mockResolvedValue({ version: 3 })
  syncCard.mockResolvedValue({})
  syncContact.mockResolvedValue({})
})

describe('saveBusinessCardAction — access', () => {
  it('refuses a card that is not a business card', async () => {
    cardFindFirst.mockResolvedValue(null)
    const result = await saveBusinessCardAction(input())
    expect(result.success).toBe(false)
    expect(cardFindFirst.mock.calls[0]![0].where).toEqual({ id: CARD, kind: 'BUSINESS_CARD' })
    expect(companyUpsert).not.toHaveBeenCalled()
  })

  it('refuses a person that belongs to another card', async () => {
    contactFindMany.mockResolvedValue([])
    const result = await saveBusinessCardAction(input())
    expect(result.success).toBe(false)
    expect(result.error?.fields?.['contacts.0']).toBeDefined()
    expect(contactFindMany.mock.calls[0]![0].where).toMatchObject({ cardId: CARD, deletedAt: null })
  })

  it('refuses a photo that is not a contact photo of this card', async () => {
    const result = await saveBusinessCardAction(
      input({ contacts: [{ ...anna, photoAssetId: 'ckasset0000000000000000001' }] }),
    )
    expect(result.success).toBe(false)
    expect(result.error?.fields?.['contacts.0.photoAssetId']).toBeDefined()
    expect(assetFindMany.mock.calls[0]![0].where).toMatchObject({ cardId: CARD, kind: 'CONTACT_PHOTO' })
  })
})

describe('saveBusinessCardAction — one save for everything', () => {
  it('does nothing and pushes nothing when nothing changed', async () => {
    const result = await saveBusinessCardAction(input())
    expect(result).toMatchObject({
      success: true,
      data: { changed: { design: false, company: false, contacts: 0, deleted: 0 } },
    })
    expect(publishDesign).not.toHaveBeenCalled()
    expect(companyUpsert).not.toHaveBeenCalled()
    expect(syncCard).not.toHaveBeenCalled()
    expect(syncContact).not.toHaveBeenCalled()
  })

  it('publishes a changed design and updates the whole card', async () => {
    const result = await saveBusinessCardAction(input({ design: { ...design, backgroundColor: '#112233' } }))
    expect(result).toMatchObject({ success: true, data: { version: 3, changed: { design: true } } })
    expect(saveDraft.mock.calls[0]![1]).toMatchObject({ backgroundColor: '#112233' })
    expect(syncCard).toHaveBeenCalledWith(CARD)
  })

  it('saves company changes and reports field errors with their path', async () => {
    const ok = await saveBusinessCardAction(input({ company: { ...company, website: 'nordlicht.de' } }))
    expect(ok.success).toBe(true)
    expect(companyUpsert.mock.calls[0]![0].update).toMatchObject({ website: 'https://nordlicht.de/' })

    const bad = await saveBusinessCardAction(input({ company: { company: '', city: 'Hamburg' } }))
    expect(bad.success).toBe(false)
    expect(bad.error?.fields?.['company.company']).toBeDefined()
  })

  it('creates new people with their own codes and maps them back', async () => {
    const result = await saveBusinessCardAction(
      input({ contacts: [anna, { id: null, key: 'new-1', firstName: 'Ben', lastName: 'Meier', links: [] }] }),
    )
    expect(result).toMatchObject({ success: true, data: { createdContactIds: { 'new-1': BEN } } })
    const data = contactCreate.mock.calls[0]![0].data
    expect(data).toMatchObject({ cardId: CARD, firstName: 'Ben', sortOrder: 1 })
    expect(data.scanCode).toMatch(/^[A-Za-z0-9_-]{16,}$/)
    expect(data.ownerClaimToken).toMatch(/^[A-Za-z0-9_-]{32,}$/)
  })

  it('updates only the person that changed and pushes only their passes', async () => {
    await saveBusinessCardAction(input({ contacts: [{ ...anna, email: 'anna@example.de' }] }))
    expect(contactUpdate.mock.calls[0]![0].data).toMatchObject({ email: 'anna@example.de' })
    expect(syncContact).toHaveBeenCalledWith(ANNA)
    expect(syncCard).not.toHaveBeenCalled()
  })

  it('soft-deletes removed people on save', async () => {
    const result = await saveBusinessCardAction(input({ contacts: [], deletedContactIds: [ANNA] }))
    expect(result).toMatchObject({ success: true, data: { changed: { deleted: 1 } } })
    const call = contactUpdateMany.mock.calls[0]![0]
    expect(call.where).toEqual({ id: { in: [ANNA] }, cardId: CARD })
    expect(call.data.deletedAt).toBeInstanceOf(Date)
    expect(call.data.ownerClaimToken).toBeNull()
    expect(syncContact).toHaveBeenCalledWith(ANNA)
  })

  it('reports bad contact input under the contact’s path', async () => {
    const result = await saveBusinessCardAction(input({ contacts: [{ ...anna, email: 'kein-at' }] }))
    expect(result.success).toBe(false)
    expect(result.error?.fields?.['contacts.0.email']).toBeDefined()
  })

  it('keeps the save when the wallet update fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    syncCard.mockRejectedValue(new Error('apns down'))
    const result = await saveBusinessCardAction(input({ design: { ...design, backgroundColor: '#112233' } }))
    expect(result.success).toBe(true)
    spy.mockRestore()
  })
})

describe('renew actions', () => {
  it('renews the scan code and updates the passes', async () => {
    const result = await renewScanCodeAction(ANNA)
    expect(result.success).toBe(true)
    expect(contactUpdate.mock.calls[0]![0].data.scanCode).toMatch(/^[A-Za-z0-9_-]{16,}$/)
    expect(syncContact).toHaveBeenCalledWith(ANNA)
  })

  it('renews the owner link', async () => {
    await renewOwnerLinkAction(ANNA)
    expect(contactUpdate.mock.calls[0]![0].data.ownerClaimToken).toMatch(/^[A-Za-z0-9_-]{32,}$/)
    expect(assertCardAccess).toHaveBeenCalledWith(CARD)
  })

  it('ignores people that are already deleted', async () => {
    contactFindFirst.mockResolvedValue(null)
    const result = await renewOwnerLinkAction(ANNA)
    expect(result.success).toBe(false)
    expect(contactFindFirst.mock.calls[0]![0].where).toEqual({ id: ANNA, deletedAt: null })
  })
})
