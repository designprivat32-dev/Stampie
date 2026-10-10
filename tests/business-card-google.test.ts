import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CARD_DESIGN } from '@/lib/cards/defaults'
import {
  buildBusinessGenericClass,
  buildBusinessGenericObject,
  businessClassId,
  businessObjectId,
  type BusinessGoogleContext,
} from '@/lib/business-cards/google-generic'
import type { BusinessCompany, BusinessContact } from '@/lib/business-cards/schema'

const contact = (over: Partial<BusinessContact> = {}): BusinessContact => ({
  firstName: 'Anna',
  lastName: 'Schmidt',
  jobTitle: 'Vertrieb',
  phone: '+49 40 123 456',
  mobile: null,
  email: 'anna@example.de',
  links: [{ label: 'LinkedIn', url: 'https://linkedin.com/in/anna' }],
  ...over,
})

const company = (over: Partial<BusinessCompany> = {}): BusinessCompany => ({
  company: 'Nordlicht GmbH',
  website: 'https://nordlicht.example/',
  phone: '+49 40 100',
  street: 'Hafenstraße 5',
  postalCode: '20457',
  city: 'Hamburg',
  ...over,
})

const ctx = (over: Partial<BusinessGoogleContext> = {}): BusinessGoogleContext => ({
  issuerId: '3388000000000000000',
  cardId: 'card1',
  serial: 'V-ABC123',
  role: 'OWNER',
  scanUrl: 'https://stampie.de/v/code123',
  privacyUrl: 'https://stampie.de/v/code123/datenschutz',
  logoUrl: 'https://stampie.de/api/wallet/logo/card1?v=1',
  ...over,
})

describe('ids', () => {
  it('never collides with the stamp card class and objects', () => {
    expect(businessClassId('1', 'card1')).toBe('1.bcard_card1')
    expect(businessObjectId('1', 'V-ABC')).toBe('1.bsn_V-ABC')
    expect(buildBusinessGenericClass('1', 'card1')).toEqual({ id: '1.bcard_card1' })
  })
})

describe('buildBusinessGenericObject', () => {
  it('fills every field Google requires', () => {
    const o = buildBusinessGenericObject(DEFAULT_CARD_DESIGN, contact(), company(), ctx())
    expect(o.id).toBe('3388000000000000000.bsn_V-ABC123')
    expect(o.classId).toBe('3388000000000000000.bcard_card1')
    expect(o.state).toBe('ACTIVE')
    expect(o.cardTitle.defaultValue.value).toBe('Nordlicht GmbH')
    expect(o.header.defaultValue.value).toBe('Anna Schmidt')
    expect(o.subheader?.defaultValue.value).toBe('Vertrieb')
    expect(o.logo.sourceUri.uri).toBe('https://stampie.de/api/wallet/logo/card1?v=1')
    expect(o.hexBackgroundColor).toBe(DEFAULT_CARD_DESIGN.backgroundColor)
  })

  it('gives the owner a QR code and the recipient none', () => {
    const owner = buildBusinessGenericObject(DEFAULT_CARD_DESIGN, contact(), company(), ctx({ role: 'OWNER' }))
    expect(owner.barcode).toEqual({
      type: 'QR_CODE',
      value: 'https://stampie.de/v/code123',
      alternateText: 'Scannen für meine Visitenkarte',
    })
    const holder = buildBusinessGenericObject(DEFAULT_CARD_DESIGN, contact(), company(), ctx({ role: 'HOLDER' }))
    expect(holder).not.toHaveProperty('barcode')
  })

  it('deactivates the object of a deleted person and drops the code', () => {
    const o = buildBusinessGenericObject(DEFAULT_CARD_DESIGN, contact(), company(), ctx({ role: 'OWNER', voided: true }))
    expect(o.state).toBe('INACTIVE')
    expect(o).not.toHaveProperty('barcode')
  })

  it('shows the photo as an image module', () => {
    const o = buildBusinessGenericObject(
      DEFAULT_CARD_DESIGN,
      contact(),
      company(),
      ctx({ photoUrl: 'https://cdn.example/photo@3x.png' }),
    )
    expect(o.imageModulesData?.[0]?.mainImage.sourceUri.uri).toBe('https://cdn.example/photo@3x.png')
    expect(buildBusinessGenericObject(DEFAULT_CARD_DESIGN, contact(), company(), ctx())).not.toHaveProperty('imageModulesData')
  })

  it('makes phone, mail, web and links tappable', () => {
    const uris = buildBusinessGenericObject(DEFAULT_CARD_DESIGN, contact(), company(), ctx()).linksModuleData.uris
    const byId = Object.fromEntries(uris.map((u) => [u.id, u]))
    expect(byId.phone!.uri).toBe('tel:+4940123456')
    expect(byId['company-phone']!.uri).toBe('tel:+4940100')
    expect(byId.email!.uri).toBe('mailto:anna@example.de')
    expect(byId.website!.uri).toBe('https://nordlicht.example/')
    expect(byId['link-0']).toMatchObject({ uri: 'https://linkedin.com/in/anna', description: 'LinkedIn' })
    expect(byId['card-privacy']!.uri).toBe('https://stampie.de/v/code123/datenschutz')
  })

  it('shows company and address as text', () => {
    const modules = buildBusinessGenericObject(DEFAULT_CARD_DESIGN, contact(), company(), ctx()).textModulesData
    expect(modules).toEqual([
      { id: 'company', header: 'Firma', body: 'Nordlicht GmbH' },
      { id: 'address', header: 'Adresse', body: 'Hafenstraße 5\n20457 Hamburg' },
    ])
  })

  it('works without company data', () => {
    const o = buildBusinessGenericObject(
      DEFAULT_CARD_DESIGN,
      contact({ jobTitle: null, phone: null, email: null, links: [] }),
      null,
      ctx(),
    )
    expect(o.cardTitle.defaultValue.value).toBe('Anna Schmidt')
    expect(o).not.toHaveProperty('subheader')
    expect(o.textModulesData).toEqual([])
    expect(o.linksModuleData.uris.map((u) => u.id)).toEqual(['card-privacy'])
  })
})

describe('buildBusinessGoogleSaveUrl', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('GOOGLE_ISSUER_ID', '')
    vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL', '')
    vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY', '')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('carries the generic class and object in the JWT', async () => {
    const { buildBusinessGoogleSaveUrl } = await import('@/lib/business-cards/google-pass')
    const url = buildBusinessGoogleSaveUrl({
      cardId: 'card1',
      design: DEFAULT_CARD_DESIGN,
      contact: contact(),
      company: company(),
      role: 'HOLDER',
      serial: 'V-ABC123',
      scanUrl: 'https://stampie.de/v/code123',
      privacyUrl: 'https://stampie.de/v/code123/datenschutz',
    })
    expect(url.startsWith('https://pay.google.com/gp/v/save/')).toBe(true)
    const jwt = url.slice('https://pay.google.com/gp/v/save/'.length)
    const claims = JSON.parse(Buffer.from(jwt.split('.')[1]!, 'base64url').toString('utf8'))
    expect(claims.typ).toBe('savetowallet')
    expect(claims.payload.genericClasses[0].id).toMatch(/\.bcard_card1$/)
    expect(claims.payload.genericObjects[0].header.defaultValue.value).toBe('Anna Schmidt')
    expect(claims.payload.genericObjects[0].barcode).toBeUndefined()
    expect(claims.payload).not.toHaveProperty('loyaltyObjects')
  })
})
