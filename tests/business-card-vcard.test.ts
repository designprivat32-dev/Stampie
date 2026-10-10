import { describe, expect, it } from 'vitest'
import {
  businessCompanySchema,
  businessContactSchema,
  normalizeWebUrl,
  parseStoredLinks,
  type BusinessCompany,
  type BusinessContact,
} from '@/lib/business-cards/schema'
import {
  buildVCard,
  escapeVCardValue,
  foldVCardLine,
  vCardFileName,
} from '@/lib/business-cards/vcard'

const contact = (over: Partial<BusinessContact> = {}): BusinessContact => ({
  firstName: 'Jürgen',
  lastName: 'Müller',
  jobTitle: 'Geschäftsführer',
  phone: '+49 40 123456',
  mobile: '+49 170 1234567',
  email: 'j.mueller@example.de',
  links: [],
  ...over,
})

const company = (over: Partial<BusinessCompany> = {}): BusinessCompany => ({
  company: 'Müller & Söhne GmbH',
  website: 'https://mueller.example/',
  phone: '+49 40 100',
  street: 'Hauptstraße 1',
  postalCode: '20095',
  city: 'Hamburg',
  ...over,
})

function lines(vcard: string): string[] {
  // Gefaltete Zeilen wieder zusammensetzen, wie es ein Importer tut.
  return vcard.replace(/\r\n /g, '').split('\r\n').filter(Boolean)
}

describe('normalizeWebUrl', () => {
  it('adds https:// when the scheme is missing', () => {
    expect(normalizeWebUrl('mueller.de')).toBe('https://mueller.de/')
  })

  it('keeps an explicit http(s) URL', () => {
    expect(normalizeWebUrl('http://mueller.de/kontakt')).toBe('http://mueller.de/kontakt')
  })

  it.each(['javascript:alert(1)', 'ftp://mueller.de', 'mailto:a@b.de', 'localhost', '   '])(
    'rejects %j',
    (input) => {
      expect(normalizeWebUrl(input)).toBeNull()
    },
  )
})

describe('businessContactSchema', () => {
  it('trims and turns empty optional fields into null', () => {
    const parsed = businessContactSchema.parse({
      firstName: '  Anna ',
      lastName: 'Schmidt',
      jobTitle: '   ',
      phone: '',
      email: ' Anna@Example.DE ',
    })
    expect(parsed).toEqual({
      firstName: 'Anna',
      lastName: 'Schmidt',
      jobTitle: null,
      phone: null,
      mobile: null,
      email: 'anna@example.de',
      links: [],
    })
  })

  it('requires first and last name', () => {
    expect(businessContactSchema.safeParse({ firstName: ' ', lastName: 'X' }).success).toBe(false)
    expect(businessContactSchema.safeParse({ firstName: 'X', lastName: '' }).success).toBe(false)
  })

  it('rejects a malformed phone number and e-mail', () => {
    expect(businessContactSchema.safeParse({ firstName: 'A', lastName: 'B', phone: 'abc' }).success).toBe(false)
    expect(businessContactSchema.safeParse({ firstName: 'A', lastName: 'B', email: 'kein-at' }).success).toBe(false)
  })

  it('normalizes link URLs and refuses script links', () => {
    const ok = businessContactSchema.parse({
      firstName: 'A',
      lastName: 'B',
      links: [{ label: 'LinkedIn', url: 'linkedin.com/in/ab' }],
    })
    expect(ok.links[0]!.url).toBe('https://linkedin.com/in/ab')

    const bad = businessContactSchema.safeParse({
      firstName: 'A',
      lastName: 'B',
      links: [{ label: 'x', url: 'javascript:alert(1)' }],
    })
    expect(bad.success).toBe(false)
  })

  it('caps the number of links', () => {
    const links = Array.from({ length: 6 }, (_, i) => ({ label: `L${i}`, url: `https://l${i}.de` }))
    expect(businessContactSchema.safeParse({ firstName: 'A', lastName: 'B', links }).success).toBe(false)
  })
})

describe('businessCompanySchema', () => {
  it('requires a company name and normalizes the website', () => {
    expect(businessCompanySchema.safeParse({ company: '' }).success).toBe(false)
    expect(businessCompanySchema.parse({ company: 'X', website: 'x.de' }).website).toBe('https://x.de/')
  })

  it('treats an empty website as not given', () => {
    expect(businessCompanySchema.parse({ company: 'X', website: '' }).website).toBeNull()
  })
})

describe('parseStoredLinks', () => {
  it('drops entries that no longer validate instead of failing', () => {
    expect(
      parseStoredLinks([
        { label: 'Web', url: 'https://a.de' },
        { label: 'kaputt', url: 'javascript:x' },
        'Unsinn',
      ]),
    ).toEqual([{ label: 'Web', url: 'https://a.de/' }])
  })

  it('returns nothing for non-arrays', () => {
    expect(parseStoredLinks(null)).toEqual([])
    expect(parseStoredLinks({})).toEqual([])
  })
})

describe('escapeVCardValue', () => {
  it('escapes backslash, comma, semicolon and newlines', () => {
    expect(escapeVCardValue('a\\b,c;d\ne\r\nf')).toBe('a\\\\b\\,c\\;d\\ne\\nf')
  })
})

describe('foldVCardLine', () => {
  it('leaves short lines alone', () => {
    expect(foldVCardLine('FN:Anna')).toBe('FN:Anna')
  })

  it('folds at 75 octets and never splits a multibyte character', () => {
    const folded = foldVCardLine(`NOTE:${'ü'.repeat(100)}`)
    const encoder = new TextEncoder()
    for (const [i, part] of folded.split('\r\n').entries()) {
      expect(encoder.encode(part).length).toBeLessThanOrEqual(75)
      if (i > 0) expect(part.startsWith(' ')).toBe(true)
      expect(part).not.toContain('�')
    }
    expect(folded.replace(/\r\n /g, '')).toBe(`NOTE:${'ü'.repeat(100)}`)
  })
})

describe('buildVCard', () => {
  it('produces a complete vCard 3.0 with CRLF line endings', () => {
    const vcard = buildVCard({ contact: contact(), company: company() })
    expect(vcard.startsWith('BEGIN:VCARD\r\nVERSION:3.0\r\n')).toBe(true)
    expect(vcard.endsWith('END:VCARD\r\n')).toBe(true)
    expect(vcard.replace(/\r\n/g, '')).not.toMatch(/\n/)
  })

  it('contains name, company, title and all contact channels', () => {
    const l = lines(buildVCard({ contact: contact(), company: company() }))
    expect(l).toContain('N:Müller;Jürgen;;;')
    expect(l).toContain('FN:Jürgen Müller')
    expect(l).toContain('ORG:Müller & Söhne GmbH')
    expect(l).toContain('TITLE:Geschäftsführer')
    expect(l).toContain('TEL;TYPE=WORK,VOICE:+49 40 123456')
    expect(l).toContain('TEL;TYPE=CELL:+49 170 1234567')
    expect(l).toContain('EMAIL;TYPE=INTERNET,WORK:j.mueller@example.de')
    expect(l).toContain('URL;TYPE=WORK:https://mueller.example/')
    expect(l).toContain('ADR;TYPE=WORK:;;Hauptstraße 1;Hamburg;;20095;')
  })

  it('falls back to the company phone only when the person has none', () => {
    const own = lines(buildVCard({ contact: contact(), company: company() }))
    expect(own.filter((x) => x.startsWith('TEL;TYPE=WORK'))).toEqual(['TEL;TYPE=WORK,VOICE:+49 40 123456'])

    const fallback = lines(buildVCard({ contact: contact({ phone: null }), company: company() }))
    expect(fallback).toContain('TEL;TYPE=WORK,VOICE:+49 40 100')
  })

  it('leaves out everything that is not set', () => {
    const l = lines(
      buildVCard({
        contact: contact({ jobTitle: null, phone: null, mobile: null, email: null }),
        company: null,
      }),
    )
    expect(l).toEqual(['BEGIN:VCARD', 'VERSION:3.0', 'N:Müller;Jürgen;;;', 'FN:Jürgen Müller', 'END:VCARD'])
  })

  it('escapes special characters in values', () => {
    const l = lines(buildVCard({ contact: contact(), company: company({ company: 'A, B; C' }) }))
    expect(l).toContain('ORG:A\\, B\\; C')
  })

  it('labels extra links', () => {
    const l = lines(
      buildVCard({
        contact: contact({ links: [{ label: 'LinkedIn', url: 'https://linkedin.com/in/jm' }] }),
        company: null,
      }),
    )
    expect(l).toContain('item1.URL:https://linkedin.com/in/jm')
    expect(l).toContain('item1.X-ABLabel:LinkedIn')
  })
})

describe('buildVCard photo', () => {
  it('embeds the photo as base64 PNG and keeps every line within 75 octets', () => {
    const png = Buffer.alloc(300, 7)
    const vcard = buildVCard({ contact: contact(), company: null, photoPng: png })
    const unfolded = lines(vcard)
    expect(unfolded).toContain(`PHOTO;ENCODING=b;TYPE=PNG:${png.toString('base64')}`)
    for (const line of vcard.split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    }
  })

  it('leaves the photo out when there is none', () => {
    expect(buildVCard({ contact: contact(), company: null, photoPng: null })).not.toContain('PHOTO')
  })
})

describe('vCardFileName', () => {
  it('turns umlauts into plain ASCII', () => {
    expect(vCardFileName(contact())).toBe('Jurgen-Muller.vcf')
    expect(vCardFileName(contact({ firstName: 'Grüße', lastName: 'Straß' }))).toBe('Grusse-Strass.vcf')
  })

  it('never returns an empty name', () => {
    expect(vCardFileName(contact({ firstName: '★', lastName: '★' }))).toBe('kontakt.vcf')
  })
})

describe('buildCompactVCard', () => {
  it('keeps only what a QR code needs, unfolded', async () => {
    const { buildCompactVCard } = await import('@/lib/business-cards/vcard')
    const v = buildCompactVCard({ contact: contact(), company: company(), photoPng: Buffer.from('x') })
    expect(v.split('\r\n')).toEqual([
      'BEGIN:VCARD',
      'VERSION:3.0',
      'N:Müller;Jürgen;;;',
      'FN:Jürgen Müller',
      'ORG:Müller & Söhne GmbH',
      'TITLE:Geschäftsführer',
      'TEL;TYPE=WORK,VOICE:+49 40 123456',
      'TEL;TYPE=CELL:+49 170 1234567',
      'EMAIL;TYPE=INTERNET,WORK:j.mueller@example.de',
      'URL:https://mueller.example/',
      'END:VCARD',
    ])
  })
})
