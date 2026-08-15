import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import forge from 'node-forge'
import {
  readAppleWalletCredentials,
  resetAppleWalletCredentialsCache,
  signManifest,
} from '@/lib/pass/apple-pass-builder'
import { APPLE_WWDR_G4_PEM } from '@/lib/pass/apple-wwdr'
import { MockPassBuilder } from '@/lib/pass/mock-pass-builder'
import { DEFAULT_CARD_DESIGN } from '@/lib/cards/defaults'
import { iconMonogram, renderFallbackIcon } from '@/lib/cards/render-icon'
import type { CardDesign } from '@/lib/pass/pass-builder'

const PASS_TYPE_ID = 'pass.de.stampie.test'
const TEAM_ID = 'A1B2C3D4E5'

/** `forge.pki.oids` is an index signature; `noUncheckedIndexedAccess` widens every read. */
function oid(name: string): string {
  const value = forge.pki.oids[name]
  if (!value) throw new Error(`unknown OID ${name}`)
  return value
}

/**
 * A stand-in for the Pass Type ID certificate: same subject fields Apple issues (UID =
 * pass type identifier, OU = team id), so every check in the loader is exercised for
 * real. Generated once — 2048-bit RSA keygen is the slowest thing in this file.
 */
function makeCertificate(options: { uid?: string; ou?: string; notAfter?: Date } = {}) {
  const keys = forge.pki.rsa.generateKeyPair(2048)
  const cert = forge.pki.createCertificate()
  cert.publicKey = keys.publicKey
  cert.serialNumber = '01'
  cert.validity.notBefore = new Date(Date.now() - 86_400_000)
  cert.validity.notAfter = options.notAfter ?? new Date(Date.now() + 365 * 86_400_000)

  const subject = [
    { type: '0.9.2342.19200300.100.1.1', value: options.uid ?? PASS_TYPE_ID },
    { name: 'commonName', value: 'Pass Type ID: ' + (options.uid ?? PASS_TYPE_ID) },
    { name: 'organizationalUnitName', value: options.ou ?? TEAM_ID },
    { name: 'organizationName', value: 'Test GmbH' },
    { name: 'countryName', value: 'DE' },
  ]
  cert.setSubject(subject)
  cert.setIssuer(subject)
  cert.sign(keys.privateKey, forge.md.sha256.create())

  return { cert, privateKey: keys.privateKey }
}

function toP12Base64(
  cert: forge.pki.Certificate,
  privateKey: forge.pki.rsa.PrivateKey,
  password: string,
): string {
  const asn1 = forge.pkcs12.toPkcs12Asn1(privateKey, [cert], password, {
    algorithm: '3des',
  })
  return Buffer.from(forge.asn1.toDer(asn1).getBytes(), 'binary').toString('base64')
}

const fixture = makeCertificate()
const P12_BASE64 = toP12Base64(fixture.cert, fixture.privateKey, '')

const ORIGINAL_ENV = { ...process.env }

function setEnv(values: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  resetAppleWalletCredentialsCache()
}

beforeEach(() => {
  setEnv({
    APPLE_PASS_TYPE_ID: PASS_TYPE_ID,
    APPLE_TEAM_ID: TEAM_ID,
    APPLE_PASS_CERTIFICATE: P12_BASE64,
    APPLE_PASS_CERTIFICATE_PASSWORD: '',
    APPLE_WWDR_CERTIFICATE: undefined,
  })
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  resetAppleWalletCredentialsCache()
})

describe('readAppleWalletCredentials', () => {
  it('opens the .p12 and reports the ids from the certificate', () => {
    const credentials = readAppleWalletCredentials()
    expect(credentials).not.toBeNull()
    expect(credentials?.passTypeIdentifier).toBe(PASS_TYPE_ID)
    expect(credentials?.teamIdentifier).toBe(TEAM_ID)
    expect(credentials?.certificatePem).toContain('BEGIN CERTIFICATE')
    expect(credentials?.privateKeyPem).toContain('PRIVATE KEY')
  })

  it('always carries the WWDR intermediate in the chain', () => {
    const chain = readAppleWalletCredentials()?.chainPem ?? []
    expect(chain).toContain(APPLE_WWDR_G4_PEM.trim())
  })

  it('is null when no certificate is configured', () => {
    setEnv({ APPLE_PASS_CERTIFICATE: '' })
    expect(readAppleWalletCredentials()).toBeNull()
  })

  it('rejects a pass type id that disagrees with the certificate', () => {
    setEnv({ APPLE_PASS_TYPE_ID: 'pass.de.stampie.something-else' })
    expect(readAppleWalletCredentials()).toBeNull()
  })

  it('rejects a team id that disagrees with the certificate', () => {
    setEnv({ APPLE_TEAM_ID: 'ZZZZZZZZZZ' })
    expect(readAppleWalletCredentials()).toBeNull()
  })

  it('rejects a team id that is not in Apple\'s format', () => {
    setEnv({ APPLE_TEAM_ID: 'my-team' })
    expect(readAppleWalletCredentials()).toBeNull()
  })

  it('rejects a wrong export password rather than throwing', () => {
    setEnv({ APPLE_PASS_CERTIFICATE_PASSWORD: 'wrong' })
    expect(readAppleWalletCredentials()).toBeNull()
  })

  it('rejects a certificate that is not base64', () => {
    setEnv({ APPLE_PASS_CERTIFICATE: 'this is not a certificate' })
    expect(readAppleWalletCredentials()).toBeNull()
  })

  it('rejects an expired certificate', () => {
    const expired = makeCertificate({ notAfter: new Date(Date.now() - 86_400_000) })
    setEnv({
      APPLE_PASS_CERTIFICATE: toP12Base64(expired.cert, expired.privateKey, ''),
    })
    expect(readAppleWalletCredentials()).toBeNull()
  })

  it('accepts a non-empty export password', () => {
    setEnv({
      APPLE_PASS_CERTIFICATE: toP12Base64(fixture.cert, fixture.privateKey, 'geheim'),
      APPLE_PASS_CERTIFICATE_PASSWORD: 'geheim',
    })
    expect(readAppleWalletCredentials()).not.toBeNull()
  })

  it('memoises per environment, and picks up a change after a reset', () => {
    expect(readAppleWalletCredentials()).toBe(readAppleWalletCredentials())
    setEnv({ APPLE_PASS_CERTIFICATE: '' })
    expect(readAppleWalletCredentials()).toBeNull()
  })
})

describe('signManifest', () => {
  const manifest = Buffer.from(JSON.stringify({ 'pass.json': 'abc' }, null, 2), 'utf8')

  function parse(signature: Buffer) {
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(signature.toString('binary')))
    return forge.pkcs7.messageFromAsn1(asn1) as forge.pkcs7.PkcsSignedData
  }

  /**
   * forge only fills `signers` on the signing side, so a parsed message has to be read
   * out of the raw ASN.1: SignerInfo ::= SEQUENCE { version, issuerAndSerial, digestAlg,
   * [0] authenticatedAttributes, ... }, each attribute a SEQUENCE of OID and a SET.
   */
  function signedAttributes(signature: Buffer): Map<string, string> {
    const p7 = parse(signature) as unknown as { rawCapture: { signerInfos: forge.asn1.Asn1[] } }
    const signerInfo = p7.rawCapture.signerInfos[0]
    expect(signerInfo).toBeDefined()

    const attributeSet = (signerInfo!.value as forge.asn1.Asn1[]).find(
      (child) => child.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && child.type === 0,
    )
    const attributes = new Map<string, string>()
    for (const attribute of (attributeSet?.value ?? []) as forge.asn1.Asn1[]) {
      const [oid, values] = attribute.value as forge.asn1.Asn1[]
      attributes.set(
        forge.asn1.derToOid(oid!.value as string),
        String(((values!.value as forge.asn1.Asn1[])[0]?.value ?? '')),
      )
    }
    return attributes
  }

  it('produces a detached PKCS#7 signature over one signer', () => {
    const credentials = readAppleWalletCredentials()!
    const p7 = parse(signManifest(manifest, credentials)) as unknown as {
      rawCapture: { content?: unknown; signerInfos: unknown[] }
    }

    // Detached: the manifest bytes stay in the bundle, they are not repeated here.
    expect(p7.rawCapture.content).toBeUndefined()
    expect(p7.rawCapture.signerInfos).toHaveLength(1)
  })

  it('ships the signer certificate and the WWDR intermediate', () => {
    const credentials = readAppleWalletCredentials()!
    const p7 = parse(signManifest(manifest, credentials))

    const subjects = p7.certificates.map((c) => c.subject.getField('CN')?.value)
    expect(subjects).toContain(`Pass Type ID: ${PASS_TYPE_ID}`)
    expect(subjects).toContain(
      'Apple Worldwide Developer Relations Certification Authority',
    )
  })

  it('signs the SHA-256 digest of exactly these manifest bytes', () => {
    const credentials = readAppleWalletCredentials()!
    const attributes = signedAttributes(signManifest(manifest, credentials))

    const digest = Buffer.from(attributes.get(oid('messageDigest')) ?? '', 'binary')
    expect(digest.toString('hex')).toBe(createHash('sha256').update(manifest).digest('hex'))
  })

  it('carries a content type and a signing time', () => {
    const credentials = readAppleWalletCredentials()!
    const attributes = signedAttributes(signManifest(manifest, credentials))

    expect(forge.asn1.derToOid(attributes.get(oid('contentType')) ?? '')).toBe(oid('data'))
    // UTCTime, YYMMDDhhmmssZ — a string written verbatim would not match.
    expect(attributes.get(oid('signingTime'))).toMatch(/^\d{12}Z$/)
  })
})

describe('the .pkpass bundle', () => {
  const design: CardDesign = {
    ...DEFAULT_CARD_DESIGN,
    programName: 'Kaffeekarte',
    rewardText: 'Jeder 10. Kaffee gratis',
    cardId: 'ccrd00000000000000000001',
    kind: 'STAMP',
    organizationName: 'Café Nord',
    currentStamps: 3,
    assets: { icon: null, logo: null, stampIcon: null, hero: null, logoUrl: null, heroUrl: null },
  }

  function entryNames(zip: Buffer): string[] {
    const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
    const count = zip.readUInt16LE(eocd + 10)
    let offset = zip.readUInt32LE(eocd + 16)
    const names: string[] = []
    for (let i = 0; i < count; i++) {
      const nameLength = zip.readUInt16LE(offset + 28)
      const extraLength = zip.readUInt16LE(offset + 30)
      const commentLength = zip.readUInt16LE(offset + 32)
      names.push(zip.subarray(offset + 46, offset + 46 + nameLength).toString('utf8'))
      offset += 46 + nameLength + extraLength + commentLength
    }
    return names
  }

  it('contains a signature once a certificate is configured', async () => {
    const zip = await new MockPassBuilder().buildApplePass(design, 'SER-1')
    expect(entryNames(zip)).toContain('signature')
  })

  it('omits the signature when Apple Wallet is not configured', async () => {
    setEnv({ APPLE_PASS_CERTIFICATE: '' })
    const zip = await new MockPassBuilder().buildApplePass(design, 'SER-1')
    expect(entryNames(zip)).not.toContain('signature')
  })

  it('always ships icon.png, even for a card without an uploaded icon', async () => {
    const names = entryNames(await new MockPassBuilder().buildApplePass(design, 'SER-1'))
    expect(names).toContain('icon.png')
    expect(names).toContain('icon@2x.png')
    expect(names).toContain('icon@3x.png')
  })
})

describe('the fallback icon', () => {
  const design = { ...DEFAULT_CARD_DESIGN, programName: 'Kaffeekarte', cardTitle: null }

  it('takes its letter from the card title, then the program, then the shop', () => {
    expect(iconMonogram({ ...design, cardTitle: 'Treuepass' }, 'Café Nord')).toBe('T')
    expect(iconMonogram(design, 'Café Nord')).toBe('K')
    expect(iconMonogram({ ...design, programName: '' }, 'Café Nord')).toBe('C')
  })

  it('renders a 29pt PNG at each Apple scale', async () => {
    const sizes = await Promise.all(
      (['1x', '2x', '3x'] as const).map((scale) => renderFallbackIcon(design, 'Café Nord', scale)),
    )
    for (const png of sizes) {
      expect(png.subarray(1, 4).toString('ascii')).toBe('PNG')
    }
    expect(sizes[0]!.length).toBeLessThan(sizes[2]!.length)
  })
})
