import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { createZip, crc32 } from '@/lib/pass/zip'
import { MockPassBuilder } from '@/lib/pass/mock-pass-builder'
import { isValidIssuerId } from '@/lib/pass/google-pass-builder'
import { DEFAULT_CARD_DESIGN } from '@/lib/cards/defaults'
import type { CardDesign } from '@/lib/pass/pass-builder'

const icon = await sharp({
  create: { width: 29, height: 29, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
})
  .png()
  .toBuffer()

const design: CardDesign = {
  ...DEFAULT_CARD_DESIGN,
  programName: 'Kaffeekarte',
  rewardText: 'Jeder 10. Kaffee gratis',
  cardId: 'ccrd00000000000000000001',
  organizationName: 'Café Nord',
  currentStamps: 6,
  assets: {
    icon: { '1x': icon },
    logo: null,
    stampIcon: null,
    hero: null,
    logoUrl: null,
    heroUrl: null,
  },
}

/** Minimal central-directory reader — enough to assert the archive is well formed. */
function listZipEntries(zip: Buffer): Array<{ name: string; size: number; crc: number }> {
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  expect(eocd).toBeGreaterThan(-1)
  const count = zip.readUInt16LE(eocd + 10)
  let offset = zip.readUInt32LE(eocd + 16)

  const entries: Array<{ name: string; size: number; crc: number }> = []
  for (let i = 0; i < count; i++) {
    expect(zip.readUInt32LE(offset)).toBe(0x02014b50)
    const crc = zip.readUInt32LE(offset + 16)
    const size = zip.readUInt32LE(offset + 24)
    const nameLength = zip.readUInt16LE(offset + 28)
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString('utf8')
    entries.push({ name, size, crc })
    offset += 46 + nameLength
  }
  return entries
}

describe('zip writer', () => {
  it('matches the reference CRC-32 vector', () => {
    // "123456789" -> 0xCBF43926
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926)
  })

  it('round-trips names, sizes and checksums', () => {
    const data = Buffer.from('hello wallet')
    const zip = createZip([{ name: 'pass.json', data }])
    const entries = listZipEntries(zip)
    expect(entries).toHaveLength(1)
    expect(entries[0]!.name).toBe('pass.json')
    expect(entries[0]!.size).toBe(data.length)
    expect(entries[0]!.crc).toBe(crc32(data))
  })

  it('is byte-reproducible for the same input', () => {
    const entries = [{ name: 'a.txt', data: Buffer.from('a') }]
    expect(createZip(entries).equals(createZip(entries))).toBe(true)
  })
})

describe('MockPassBuilder', () => {
  it('produces a .pkpass with all required members', async () => {
    const bundle = await new MockPassBuilder().buildApplePass(design, 'SN-1')
    const names = listZipEntries(bundle).map((e) => e.name)

    expect(names).toContain('pass.json')
    expect(names).toContain('manifest.json')
    expect(names).toContain('icon.png')
    // All three strip resolutions, freshly rendered for this stamp count.
    expect(names).toContain('strip.png')
    expect(names).toContain('strip@2x.png')
    expect(names).toContain('strip@3x.png')
  })

  it('omits the signature — signing needs the Apple certificate', async () => {
    const bundle = await new MockPassBuilder().buildApplePass(design, 'SN-1')
    expect(listZipEntries(bundle).map((e) => e.name)).not.toContain('signature')
  })

  it('writes a manifest of SHA-1 digests that match the payloads', async () => {
    const bundle = await new MockPassBuilder().buildApplePass(design, 'SN-1')
    const entries = listZipEntries(bundle)
    const manifestEntry = entries.find((e) => e.name === 'manifest.json')
    expect(manifestEntry).toBeDefined()

    // Re-extract the manifest by locating its local header payload.
    const marker = Buffer.from('manifest.json')
    const at = bundle.indexOf(marker)
    const start = at + marker.length
    const manifest = JSON.parse(
      bundle.subarray(start, start + manifestEntry!.size).toString('utf8'),
    ) as Record<string, string>

    expect(Object.keys(manifest)).toContain('pass.json')
    expect(manifest['icon.png']).toBe(createHash('sha1').update(icon).digest('hex'))
  })

  it('renders a different bundle for a different stamp count', async () => {
    const builder = new MockPassBuilder()
    const [a, b] = await Promise.all([
      builder.buildApplePass({ ...design, currentStamps: 3 }, 'SN-1'),
      builder.buildApplePass({ ...design, currentStamps: 9 }, 'SN-1'),
    ])
    expect(a.equals(b)).toBe(false)
  })

  it('builds a Google save URL carrying the loyalty payload', async () => {
    const url = await new MockPassBuilder().buildGoogleSaveUrl(design, 'SN-1')
    expect(url.startsWith('https://pay.google.com/gp/v/save/')).toBe(true)

    const jwt = url.split('/').pop()!
    const [, body] = jwt.split('.')
    const payload = JSON.parse(Buffer.from(body!, 'base64url').toString('utf8')) as {
      payload: { loyaltyClasses: Array<{ programName: string; hexBackgroundColor: string }> }
    }
    expect(payload.payload.loyaltyClasses[0]!.programName).toBe('Kaffeekarte')
    expect(payload.payload.loyaltyClasses[0]!.hexBackgroundColor).toBe('#1a1a1a')
  })
})

describe('issuer id validation', () => {
  // The console shows the Merchant ID much more prominently than the Issuer ID, and
  // pasting it yields only a generic "Something went wrong" from Google.
  it.each(['3388000000022123456', '1234567890'])('accepts numeric issuer id %s', (id) => {
    expect(isValidIssuerId(id)).toBe(true)
  })

  it.each([
    ['BCR2DN6DTL6KLF2C', 'a Google Pay Merchant ID'],
    ['', 'empty'],
    ['3388-0000-0002', 'dashes'],
    ['issuer123456789', 'letters'],
    ['12345', 'too short'],
  ])('rejects %s (%s)', (id) => {
    expect(isValidIssuerId(id)).toBe(false)
  })
})
