import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CARD_DESIGN } from '@/lib/cards/defaults'
import {
  buildBusinessPassJson,
  displayUrl,
  type BuildBusinessPassContext,
} from '@/lib/business-cards/apple-pass-json'
import { buildBusinessApplePass } from '@/lib/business-cards/apple-pass-builder'
import {
  BUSINESS_SERIAL_PREFIX,
  isBusinessSerial,
  isPlausibleCode,
  newBusinessSerial,
  newOwnerClaimToken,
  newScanCode,
} from '@/lib/business-cards/serial'
import { toBusinessCompany, toBusinessContact } from '@/lib/business-cards/mapping'
import type { BusinessCompany, BusinessContact } from '@/lib/business-cards/schema'

const contact = (over: Partial<BusinessContact> = {}): BusinessContact => ({
  firstName: 'Anna',
  lastName: 'Schmidt',
  jobTitle: 'Vertrieb',
  phone: '+49 40 123456',
  mobile: '+49 170 1234567',
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

const ctx = (over: Partial<BuildBusinessPassContext> = {}): BuildBusinessPassContext => ({
  role: 'OWNER',
  serial: 'V-ABC123',
  passTypeIdentifier: 'pass.de.stampie.card',
  teamIdentifier: 'ABCDE12345',
  scanUrl: 'https://stampie.de/v/code123',
  privacyUrl: 'https://stampie.de/v/code123/datenschutz',
  ...over,
})

/** Der Stil ist je Rolle ein anderer; die Felder liegen unter dem jeweiligen Schlüssel. */
function structureOf(p: ReturnType<typeof buildBusinessPassJson>) {
  const s = p.storeCard ?? p.eventTicket
  if (!s) throw new Error('pass has neither storeCard nor eventTicket')
  return s
}

describe('buildBusinessPassJson', () => {
  it('gives the owner a store card, so the banner fills the card', () => {
    const p = buildBusinessPassJson(DEFAULT_CARD_DESIGN, contact(), company(), ctx({ role: 'OWNER' }))
    expect(p.storeCard).toBeDefined()
    expect(p).not.toHaveProperty('eventTicket')
    expect(p).not.toHaveProperty('coupon')
    expect(p.description).toBe('Visitenkarte Anna Schmidt')
    expect(p.organizationName).toBe('Nordlicht GmbH')
  })

  it('puts the owner name over the banner, title and contact below', () => {
    const s = structureOf(buildBusinessPassJson(DEFAULT_CARD_DESIGN, contact(), company(), ctx({ role: 'OWNER' })))
    expect(s.primaryFields).toEqual([{ key: 'name', value: 'Anna Schmidt' }])
    expect(s.secondaryFields.map((f) => f.value)).toEqual(['Vertrieb', '+49 170 1234567', 'anna@example.de'])
    expect(s.auxiliaryFields).toEqual([])
  })

  it('gives the owner pass a QR code pointing at the scan page', () => {
    const p = buildBusinessPassJson(DEFAULT_CARD_DESIGN, contact(), company(), ctx({ role: 'OWNER' }))
    expect(p.barcodes).toHaveLength(1)
    expect(p.barcode).toEqual(p.barcodes![0])
    expect(p.barcode!.format).toBe('PKBarcodeFormatQR')
    expect(p.barcode!.message).toBe('https://stampie.de/v/code123')
    expect(p.barcode!.messageEncoding).toBe('iso-8859-1')
  })

  it('gives the recipient an event ticket without any code', () => {
    const p = buildBusinessPassJson(DEFAULT_CARD_DESIGN, contact(), company(), ctx({ role: 'HOLDER' }))
    expect(p.eventTicket).toBeDefined()
    expect(p).not.toHaveProperty('storeCard')
    expect(p).not.toHaveProperty('barcode')
    expect(p).not.toHaveProperty('barcodes')
    expect(JSON.stringify(p)).not.toContain('PKBarcodeFormat')
  })

  it('fills the recipient card with as many contact details as Apple allows on the front', () => {
    const s = structureOf(buildBusinessPassJson(DEFAULT_CARD_DESIGN, contact(), company(), ctx({ role: 'HOLDER' })))
    expect(s.headerFields).toEqual([{ key: 'city', label: 'Ort', value: 'Hamburg' }])
    expect(s.primaryFields).toEqual([{ key: 'name', label: 'Vertrieb', value: 'Anna Schmidt' }])
    expect(s.secondaryFields.map((f) => [f.label, f.value])).toEqual([
      ['Firma', 'Nordlicht GmbH'],
      ['Telefon', '+49 40 123456'],
      ['Mobil', '+49 170 1234567'],
    ])
    expect(s.auxiliaryFields.map((f) => [f.row, f.label, f.value])).toEqual([
      [0, 'E-Mail', 'anna@example.de'],
      [0, 'Web', 'nordlicht.example'],
      [1, 'Adresse', 'Hafenstraße 5, 20457 Hamburg'],
      [1, 'Zentrale', '+49 40 100'],
      [1, 'LinkedIn', 'linkedin.com/in/anna'],
    ])
  })

  it('prohibits sharing for both roles', () => {
    expect(buildBusinessPassJson(DEFAULT_CARD_DESIGN, contact(), company(), ctx({ role: 'OWNER' })).sharingProhibited).toBe(true)
    expect(buildBusinessPassJson(DEFAULT_CARD_DESIGN, contact(), company(), ctx({ role: 'HOLDER' })).sharingProhibited).toBe(true)
  })

  it('lists every contact channel on the back', () => {
    const back = structureOf(buildBusinessPassJson(DEFAULT_CARD_DESIGN, contact(), company(), ctx())).backFields
    const byKey = Object.fromEntries(back.map((f) => [f.key, f]))
    expect(byKey.phone!.value).toBe('+49 40 123456')
    expect(byKey.mobile!.value).toBe('+49 170 1234567')
    expect(byKey['company-phone']!.value).toBe('+49 40 100')
    expect(byKey.email!.value).toBe('anna@example.de')
    expect(byKey.website!.attributedValue).toBe('<a href="https://nordlicht.example/">nordlicht.example</a>')
    expect(byKey.address!.value).toBe('Hafenstraße 5\n20457 Hamburg')
    expect(byKey['link-0']!.label).toBe('LinkedIn')
    expect(byKey['card-privacy']!.value).toBe('https://stampie.de/v/code123/datenschutz')
  })

  it('does not repeat the company phone when it is the person’s own number', () => {
    const back = structureOf(buildBusinessPassJson(
      DEFAULT_CARD_DESIGN,
      contact({ phone: '+49 40 100' }),
      company(),
      ctx(),
    )).backFields
    expect(back.find((f) => f.key === 'company-phone')).toBeUndefined()
  })

  it('escapes HTML in link texts', () => {
    const back = structureOf(buildBusinessPassJson(
      DEFAULT_CARD_DESIGN,
      contact({ links: [{ label: 'X', url: 'https://a.de/?q="<b>"' }] }),
      null,
      ctx(),
    )).backFields
    const attr = back.find((f) => f.key === 'link-0')!.attributedValue!
    expect(attr).not.toContain('<b>')
    expect(attr).toContain('&lt;b&gt;')
  })

  it('works without company data', () => {
    const p = buildBusinessPassJson(
      DEFAULT_CARD_DESIGN,
      contact({ phone: null, mobile: null, email: null, jobTitle: null, links: [] }),
      null,
      ctx(),
    )
    expect(p.organizationName).toBe('Anna Schmidt')
    expect(structureOf(p).secondaryFields).toEqual([])
    expect(structureOf(p).auxiliaryFields).toEqual([])
    expect(structureOf(p).backFields.map((f) => f.key)).toEqual(['card-privacy'])
  })

  it('advertises the web service only with a token', () => {
    expect(buildBusinessPassJson(DEFAULT_CARD_DESIGN, contact(), company(), ctx())).not.toHaveProperty('webServiceURL')
    const p = buildBusinessPassJson(
      DEFAULT_CARD_DESIGN,
      contact(),
      company(),
      ctx({ webService: { url: 'https://stampie.de/api/apple-passkit', authenticationToken: 't' } }),
    )
    expect(p.webServiceURL).toBe('https://stampie.de/api/apple-passkit')
    expect(p.authenticationToken).toBe('t')
  })

  it('voids the pass of a deleted person and drops the code', () => {
    const p = buildBusinessPassJson(DEFAULT_CARD_DESIGN, contact(), company(), ctx({ role: 'OWNER', voided: true }))
    expect(p.voided).toBe(true)
    expect(p).not.toHaveProperty('barcode')
    expect(structureOf(p).backFields[0]).toMatchObject({ key: 'voided', value: 'Diese Visitenkarte ist nicht mehr gültig.' })
  })

  it('leaves live passes unvoided', () => {
    expect(buildBusinessPassJson(DEFAULT_CARD_DESIGN, contact(), company(), ctx())).not.toHaveProperty('voided')
  })

  it('uses the card title as logo text, else the company', () => {
    expect(buildBusinessPassJson({ ...DEFAULT_CARD_DESIGN, cardTitle: 'NL' }, contact(), company(), ctx()).logoText).toBe('NL')
    expect(buildBusinessPassJson({ ...DEFAULT_CARD_DESIGN, cardTitle: '' }, contact(), company(), ctx()).logoText).toBe('Nordlicht GmbH')
  })
})

describe('displayUrl', () => {
  it('drops scheme and trailing slash', () => {
    expect(displayUrl('https://a.de/')).toBe('a.de')
    expect(displayUrl('http://a.de/x')).toBe('a.de/x')
  })
})

describe('serials and codes', () => {
  it('marks business serials with their own prefix', () => {
    const serial = newBusinessSerial()
    expect(serial.startsWith(BUSINESS_SERIAL_PREFIX)).toBe(true)
    expect(isBusinessSerial(serial)).toBe(true)
    expect(isBusinessSerial(serial.toLowerCase())).toBe(true)
  })

  it.each(['K-ABC', 'G-ABC', 'TEST-ABC'])('does not claim %s', (serial) => {
    expect(isBusinessSerial(serial)).toBe(false)
  })

  it('generates codes that pass the plausibility check and differ', () => {
    expect(isPlausibleCode(newScanCode())).toBe(true)
    expect(isPlausibleCode(newOwnerClaimToken())).toBe(true)
    expect(newScanCode()).not.toBe(newScanCode())
  })

  it.each(['', 'kurz', 'mit leerzeichen drin 123456', '../../etc/passwd/xxxxxx'])(
    'rejects %j as a code',
    (code) => {
      expect(isPlausibleCode(code)).toBe(false)
    },
  )
})

describe('mapping', () => {
  it('reads links defensively from JSON', () => {
    const c = toBusinessContact({
      firstName: 'A',
      lastName: 'B',
      jobTitle: null,
      phone: null,
      mobile: null,
      email: null,
      links: [{ label: 'Web', url: 'https://a.de' }, { nope: true }],
    })
    expect(c.links).toEqual([{ label: 'Web', url: 'https://a.de/' }])
  })

  it('keeps a missing company missing', () => {
    expect(toBusinessCompany(null)).toBeNull()
  })
})

/** Reads one stored entry from the archive — the writer never compresses. */
function readZipEntry(zip: Buffer, wanted: string): Buffer | null {
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  const count = zip.readUInt16LE(eocd + 10)
  let offset = zip.readUInt32LE(eocd + 16)
  for (let i = 0; i < count; i++) {
    const size = zip.readUInt32LE(offset + 24)
    const nameLength = zip.readUInt16LE(offset + 28)
    const extraLength = zip.readUInt16LE(offset + 30)
    const commentLength = zip.readUInt16LE(offset + 32)
    const local = zip.readUInt32LE(offset + 42)
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString('utf8')
    if (name === wanted) {
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28)
      return zip.subarray(start, start + size)
    }
    offset += 46 + nameLength + extraLength + commentLength
  }
  return null
}

describe('buildBusinessApplePass', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.stubEnv('APPLE_PASS_CERTIFICATE', '')
  })

  const config = {
    passTypeIdentifier: 'pass.de.stampie.card',
    teamIdentifier: 'ABCDE12345',
    appUrl: 'https://stampie.de',
    googleIssuerId: '3388000000000000000',
  }

  const input = (role: 'OWNER' | 'HOLDER') => ({
    design: DEFAULT_CARD_DESIGN,
    contact: contact(),
    company: company(),
    role,
    serial: 'V-ABC123',
    scanUrl: 'https://stampie.de/v/code123',
    privacyUrl: 'https://stampie.de/v/code123/datenschutz',
    assets: { icon: null, logo: null, photo: null },
    appleAuthToken: 'tok',
  })

  it('bundles pass.json, a fallback icon and the manifest', async () => {
    const zip = await buildBusinessApplePass(input('OWNER'), config)
    const pass = JSON.parse(readZipEntry(zip, 'pass.json')!.toString('utf8'))
    expect(pass.storeCard.primaryFields[0].value).toBe('Anna Schmidt')
    expect(pass.barcode.message).toBe('https://stampie.de/v/code123')
    expect(readZipEntry(zip, 'icon.png')).not.toBeNull()
    expect(readZipEntry(zip, 'strip.png')).not.toBeNull()

    const manifest = JSON.parse(readZipEntry(zip, 'manifest.json')!.toString('utf8'))
    expect(Object.keys(manifest).sort()).toEqual([
      'icon.png',
      'icon@2x.png',
      'icon@3x.png',
      'pass.json',
      'strip.png',
      'strip@2x.png',
      'strip@3x.png',
    ])
  })

  it('leaves out the web service without a certificate', async () => {
    const zip = await buildBusinessApplePass(input('HOLDER'), config)
    const pass = JSON.parse(readZipEntry(zip, 'pass.json')!.toString('utf8'))
    expect(pass.webServiceURL).toBeUndefined()
    expect(pass.barcode).toBeUndefined()
    expect(pass.eventTicket).toBeDefined()
    expect(readZipEntry(zip, 'signature')).toBeNull()
  })

  it('puts the owner photo into the banner at the store card size (375×144)', async () => {
    const sharp = (await import('sharp')).default
    const png = await sharp({ create: { width: 60, height: 60, channels: 3, background: '#aa5500' } }).png().toBuffer()
    const zip = await buildBusinessApplePass(
      { ...input('OWNER'), assets: { icon: null, logo: null, photo: { '1x': png } } },
      config,
    )
    expect(readZipEntry(zip, 'thumbnail.png')).toBeNull()
    const meta = await sharp(readZipEntry(zip, 'strip@2x.png')!).metadata()
    expect([meta.width, meta.height]).toEqual([750, 288])
  })

  it('shows the recipient photo next to the name, without a banner', async () => {
    const photo = { '1x': Buffer.from('p1'), '2x': Buffer.from('p2') }
    const zip = await buildBusinessApplePass({ ...input('HOLDER'), assets: { icon: null, logo: null, photo } }, config)
    expect(readZipEntry(zip, 'thumbnail.png')!.toString()).toBe('p1')
    expect(readZipEntry(zip, 'thumbnail@2x.png')!.toString()).toBe('p2')
    expect(readZipEntry(zip, 'strip.png')).toBeNull()
  })
})
