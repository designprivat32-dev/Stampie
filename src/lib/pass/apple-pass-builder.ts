import 'server-only'
import forge from 'node-forge'
import { APPLE_WWDR_G4_PEM } from './apple-wwdr'

/**
 * Real .pkpass signatures.
 *
 * A pass bundle is accepted by Wallet only if it contains a `signature` file: a detached
 * PKCS#7 (CMS) signature over the bytes of `manifest.json`, signed with the Pass Type ID
 * certificate and carrying the Apple WWDR intermediate so the chain reaches the Apple
 * Root CA. Anything else — unsigned, self-signed, wrong team — fails with the same
 * useless "Safari cannot download this file" on the phone, so every failure mode that can
 * be detected here is detected here and logged with the actual mismatch.
 *
 * Required environment:
 *   APPLE_PASS_TYPE_ID              pass.de.example.card  (must equal the certificate's UID)
 *   APPLE_TEAM_ID                   10-character team id  (must equal the certificate's OU)
 *   APPLE_PASS_CERTIFICATE          base64 of the Pass Type ID .p12
 *   APPLE_PASS_CERTIFICATE_PASSWORD export password of that .p12 (empty string allowed)
 *   APPLE_WWDR_CERTIFICATE          optional override, PEM or base64 DER
 *
 * node-forge does the PKCS#12 parsing and CMS assembly. Node's own crypto has neither.
 */

export interface AppleWalletCredentials {
  passTypeIdentifier: string
  teamIdentifier: string
  /** Signer certificate (the Pass Type ID cert) in PEM. */
  certificatePem: string
  privateKeyPem: string
  /** WWDR intermediate plus anything else the .p12 shipped, PEM each. */
  chainPem: string[]
}

const TEAM_ID_RE = /^[A-Z0-9]{10}$/
/** RFC 4519 userId — Apple puts the pass type identifier here. */
const UID_OID = '0.9.2342.19200300.100.1.1'

/**
 * forge exposes its OID table as a plain index signature, which `noUncheckedIndexedAccess`
 * widens to `string | undefined` at every use. Resolving them once keeps the signing code
 * free of non-null assertions.
 */
function oid(name: string): string {
  const value = forge.pki.oids[name]
  if (!value) throw new Error(`node-forge does not know the OID "${name}"`)
  return value
}

interface EnvSnapshot {
  passTypeId: string
  teamId: string
  certificate: string
  password: string
  wwdr: string
}

function readEnv(): EnvSnapshot {
  return {
    passTypeId: (process.env.APPLE_PASS_TYPE_ID ?? '').trim(),
    teamId: (process.env.APPLE_TEAM_ID ?? '').trim(),
    certificate: (process.env.APPLE_PASS_CERTIFICATE ?? '').trim(),
    // An empty export password is legal, so only the certificate itself gates the feature.
    password: process.env.APPLE_PASS_CERTIFICATE_PASSWORD ?? '',
    wwdr: (process.env.APPLE_WWDR_CERTIFICATE ?? '').trim(),
  }
}

let cache: { key: string; value: AppleWalletCredentials | null } | null = null

/**
 * Parsed credentials, or null when Apple Wallet is not configured or the certificate
 * cannot be used. Mirrors readGoogleWalletCredentials(): a broken configuration logs the
 * reason and degrades to "not configured" rather than throwing into a download handler.
 *
 * Memoised per env fingerprint — PKCS#12 decryption is expensive and the environment does
 * not change within a process, but tests swap it constantly.
 */
export function readAppleWalletCredentials(): AppleWalletCredentials | null {
  const env = readEnv()
  const key = JSON.stringify(env)
  if (cache && cache.key === key) return cache.value

  const value = parseCredentials(env)
  cache = { key, value }
  return value
}

/** Test seam — drops the memoised parse so a changed env is picked up. */
export function resetAppleWalletCredentialsCache(): void {
  cache = null
}

function parseCredentials(env: EnvSnapshot): AppleWalletCredentials | null {
  if (!env.certificate) return null

  if (!env.passTypeId) {
    fail('APPLE_PASS_CERTIFICATE is set but APPLE_PASS_TYPE_ID is empty.')
    return null
  }
  if (!TEAM_ID_RE.test(env.teamId)) {
    fail(
      `APPLE_TEAM_ID="${env.teamId}" is not a team id. It is the 10-character code shown ` +
        'under Membership details in the Apple Developer portal, e.g. "A1B2C3D4E5".',
    )
    return null
  }

  let p12Der: Buffer
  try {
    p12Der = decodeBase64Strict(env.certificate)
  } catch {
    fail('APPLE_PASS_CERTIFICATE is not valid base64. Re-run `npm run apple:cert -- pack`.')
    return null
  }

  let bags: { certificates: forge.pki.Certificate[]; privateKey: forge.pki.rsa.PrivateKey }
  try {
    bags = openPkcs12(p12Der, env.password)
  } catch (error) {
    fail(
      'APPLE_PASS_CERTIFICATE could not be opened. Most likely the export password in ' +
        `APPLE_PASS_CERTIFICATE_PASSWORD is wrong. (${messageOf(error)})`,
    )
    return null
  }

  const signer = findSignerCertificate(bags.certificates, bags.privateKey)
  if (!signer) {
    fail('The .p12 contains no certificate matching its private key.')
    return null
  }

  const certUid = attributeValue(signer, UID_OID)
  const certTeam = attributeValue(signer, 'organizationalUnitName')

  if (certUid && certUid !== env.passTypeId) {
    fail(
      `APPLE_PASS_TYPE_ID="${env.passTypeId}" does not match the certificate, which is ` +
        `issued for "${certUid}". Wallet rejects a pass whose passTypeIdentifier and ` +
        'signing certificate disagree.',
    )
    return null
  }
  if (certTeam && certTeam !== env.teamId) {
    fail(
      `APPLE_TEAM_ID="${env.teamId}" does not match the certificate, which belongs to team ` +
        `"${certTeam}".`,
    )
    return null
  }

  const notAfter = signer.validity.notAfter
  if (notAfter.getTime() < Date.now()) {
    fail(
      `The Pass Type ID certificate expired on ${notAfter.toISOString().slice(0, 10)}. ` +
        'Issue a new one in the Apple Developer portal.',
    )
    return null
  }

  const wwdr = resolveWwdr(env.wwdr)
  if (!wwdr) {
    fail('APPLE_WWDR_CERTIFICATE is set but is neither PEM nor base64 DER.')
    return null
  }

  // The .p12 usually ships the intermediate too. Keeping both is harmless — CMS
  // deduplicates on the receiving side — and dropping ours would break an export that
  // only contained the leaf.
  const chainPem = [
    wwdr,
    ...bags.certificates
      .filter((c) => c !== signer)
      .map((c) => forge.pki.certificateToPem(c).trim()),
  ]

  return {
    passTypeIdentifier: env.passTypeId,
    teamIdentifier: env.teamId,
    certificatePem: forge.pki.certificateToPem(signer).trim(),
    privateKeyPem: forge.pki.privateKeyToPem(bags.privateKey).trim(),
    chainPem: dedupe(chainPem),
  }
}

/**
 * Detached PKCS#7 signature over the manifest bytes — the contents of the `signature`
 * entry in the .pkpass.
 */
export function signManifest(manifest: Buffer, credentials: AppleWalletCredentials): Buffer {
  const signerCert = forge.pki.certificateFromPem(credentials.certificatePem)
  const privateKey = forge.pki.privateKeyFromPem(credentials.privateKeyPem)

  const p7 = forge.pkcs7.createSignedData()
  p7.content = forge.util.createBuffer(manifest.toString('binary'))
  p7.addCertificate(signerCert)
  for (const pem of credentials.chainPem) {
    p7.addCertificate(forge.pki.certificateFromPem(pem))
  }

  p7.addSigner({
    key: privateKey,
    certificate: signerCert,
    digestAlgorithm: oid('sha256'),
    authenticatedAttributes: [
      { type: oid('contentType'), value: oid('data') },
      { type: oid('messageDigest') },
      // No value: forge fills in the current time as a proper UTCTime. Handing it a
      // string here would be written into the DER verbatim and Wallet would reject it.
      { type: oid('signingTime') },
    ],
  })

  // detached: the manifest bytes stay in the bundle, not inside the signature.
  p7.sign({ detached: true })

  return Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), 'binary')
}

function openPkcs12(
  der: Buffer,
  password: string,
): { certificates: forge.pki.Certificate[]; privateKey: forge.pki.rsa.PrivateKey } {
  const asn1 = forge.asn1.fromDer(forge.util.createBuffer(der.toString('binary')))
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password)

  const certificates = collectBags(p12, oid('certBag'))
    .map((bag) => bag.cert)
    .filter((c): c is forge.pki.Certificate => Boolean(c))

  const privateKey =
    collectBags(p12, oid('pkcs8ShroudedKeyBag'))
      .concat(collectBags(p12, oid('keyBag')))
      .map((bag) => bag.key)
      .find((k): k is forge.pki.rsa.PrivateKey => Boolean(k)) ?? null

  if (!privateKey) throw new Error('no private key in the .p12')

  return { certificates, privateKey }
}

function collectBags(p12: forge.pkcs12.Pkcs12Pfx, bagType: string): forge.pkcs12.Bag[] {
  const bags = p12.getBags({ bagType })[bagType]
  return bags ?? []
}

/**
 * The .p12 holds the leaf and (usually) the WWDR intermediate. Only the leaf matches the
 * private key, and matching on the RSA modulus is the one test that cannot be fooled by
 * subject names.
 */
function findSignerCertificate(
  certificates: forge.pki.Certificate[],
  privateKey: forge.pki.rsa.PrivateKey,
): forge.pki.Certificate | null {
  const modulus = privateKey.n
  if (!modulus) return certificates[0] ?? null

  return (
    certificates.find((cert) => {
      const publicKey = cert.publicKey as forge.pki.rsa.PublicKey | undefined
      return Boolean(publicKey?.n && publicKey.n.compareTo(modulus) === 0)
    }) ?? null
  )
}

function attributeValue(cert: forge.pki.Certificate, nameOrType: string): string | null {
  const field =
    cert.subject.getField({ type: nameOrType }) ?? cert.subject.getField({ name: nameOrType })
  const value = field?.value
  return typeof value === 'string' && value.length > 0 ? value : null
}

/** Accepts a PEM block or base64 DER; returns PEM. */
function resolveWwdr(override: string): string | null {
  if (!override) return APPLE_WWDR_G4_PEM

  if (override.includes('BEGIN CERTIFICATE')) return override.trim()

  try {
    const der = decodeBase64Strict(override)
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(der.toString('binary')))
    return forge.pki.certificateToPem(forge.pki.certificateFromAsn1(asn1)).trim()
  } catch {
    return null
  }
}

/**
 * `Buffer.from(x, 'base64')` silently drops anything it cannot parse, which turns a
 * pasted-wrong certificate into an unhelpful "no private key" further down.
 */
function decodeBase64Strict(value: string): Buffer {
  const compact = value.replace(/\s+/g, '')
  const decoded = Buffer.from(compact, 'base64')
  if (decoded.length === 0 || decoded.toString('base64').replace(/=+$/, '') !== compact.replace(/=+$/, '')) {
    throw new Error('not base64')
  }
  return decoded
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)]
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function fail(message: string): void {
  // eslint-disable-next-line no-console
  console.error(`[apple-wallet] ${message}`)
}
