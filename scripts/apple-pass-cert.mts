/**
 * Apple Wallet certificate helper.
 *
 * Everything Apple documents for pass certificates assumes Keychain Access on a Mac.
 * None of it is actually Mac-only: a Pass Type ID certificate is an ordinary RSA key plus
 * a CSR, and the .p12 is an ordinary PKCS#12 bundle. This script does both with OpenSSL,
 * so the whole setup runs on Windows or Linux.
 *
 *   npm run apple:cert -- csr            generate key + CSR  (upload the CSR to Apple)
 *   npm run apple:cert -- pack pass.cer  bundle the downloaded certificate into a .p12
 *   npm run apple:cert -- env            print the env lines for the existing .p12
 *   npm run apple:cert -- check          inspect the certificate currently in .env
 *
 * Key material is written to ./apple-certs, which is gitignored. It never leaves the
 * machine — Apple only ever sees the CSR.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

const DIR = resolve('apple-certs')
const KEY = resolve(DIR, 'pass.key')
const CSR = resolve(DIR, 'pass.csr')
const P12 = resolve(DIR, 'pass.p12')

// Dispatch lives at the bottom of the file: `let` bindings below it would otherwise be in
// their temporal dead zone while a command runs.
async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2)

  switch (command) {
    case 'csr':
      await generateCsr()
      break
    case 'pack':
      await pack(args[0])
      break
    case 'env':
      printEnv()
      break
    case 'check':
      await check()
      break
    default:
      usage()
      process.exit(command ? 1 : 0)
  }
}

function usage(): void {
  console.log(
    [
      '',
      'Apple Wallet certificate helper',
      '',
      '  npm run apple:cert -- csr            1. generate private key + CSR',
      '  npm run apple:cert -- pack pass.cer  2. bundle Apple\'s certificate into a .p12',
      '  npm run apple:cert -- env            3. print the .env lines',
      '  npm run apple:cert -- check          verify what is configured right now',
      '',
      'Full walkthrough: APPLE-WALLET.md',
      '',
    ].join('\n'),
  )
}

/**
 * Git for Windows ships OpenSSL but does not put it on the PATH of a normal PowerShell
 * session, so `openssl` resolves only inside Git Bash. Rather than making the shell part
 * of the instructions, look in the places it actually installs to.
 */
function findOpenssl(): string {
  const candidates = [
    'openssl',
    ...(process.platform === 'win32'
      ? [
          `${process.env.ProgramFiles ?? 'C:\\Program Files'}\\Git\\usr\\bin\\openssl.exe`,
          `${process.env.ProgramFiles ?? 'C:\\Program Files'}\\Git\\mingw64\\bin\\openssl.exe`,
          `${process.env.LOCALAPPDATA ?? ''}\\Programs\\Git\\usr\\bin\\openssl.exe`,
          `${process.env.ProgramFiles ?? 'C:\\Program Files'}\\OpenSSL-Win64\\bin\\openssl.exe`,
        ]
      : []),
  ]

  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ['version'], { stdio: 'ignore' })
      return candidate
    } catch {
      // next candidate
    }
  }

  throw new Error(
    'OpenSSL not found. It ships with Git for Windows — install Git, or run ' +
      '`winget install ShiningLight.OpenSSL.Light`.',
  )
}

let opensslPath: string | null = null

function openssl(argv: string[], input?: Buffer): Buffer {
  opensslPath ??= findOpenssl()
  try {
    return execFileSync(opensslPath, argv, { input, maxBuffer: 32 * 1024 * 1024 })
  } catch (error) {
    const stderr = (error as { stderr?: Buffer }).stderr?.toString().trim()
    throw new Error(`openssl ${argv[0]} failed${stderr ? `:\n${stderr}` : ''}`)
  }
}

async function generateCsr(): Promise<void> {
  mkdirSync(DIR, { recursive: true })

  if (existsSync(KEY)) {
    throw new Error(
      `${KEY} already exists. Delete apple-certs/ first if you really want a new key — ` +
        'a new key invalidates the certificate Apple issued for the old one.',
    )
  }

  const email = process.env.APPLE_CSR_EMAIL?.trim() || 'dev@stampie.de'
  const commonName = process.env.APPLE_CSR_NAME?.trim() || 'Stampie Pass Type ID'

  openssl(['genrsa', '-out', KEY, '2048'])
  openssl([
    'req',
    '-new',
    '-key',
    KEY,
    '-out',
    CSR,
    '-subj',
    // Apple ignores everything but the key itself; these only label the request.
    `/emailAddress=${email}/CN=${commonName}/C=DE`,
  ])

  console.log(
    [
      '',
      '✓ Private key   apple-certs/pass.key   (never leaves this machine)',
      '✓ Request       apple-certs/pass.csr   (upload this one)',
      '',
      'Next:',
      '  1. https://developer.apple.com/account/resources/identifiers/list/passTypeId',
      '     → + → Pass Type IDs → identifier e.g. pass.de.stampie.stampcard',
      '  2. https://developer.apple.com/account/resources/certificates/list',
      '     → + → Pass Type ID Certificate → pick the identifier → upload apple-certs/pass.csr',
      '  3. Download the .cer and run:  npm run apple:cert -- pack pass.cer',
      '',
    ].join('\n'),
  )
}

async function pack(cerPath: string | undefined): Promise<void> {
  if (!cerPath) throw new Error('Usage: npm run apple:cert -- pack <downloaded .cer>')
  const cer = resolve(cerPath)
  if (!existsSync(cer)) throw new Error(`${cer} does not exist.`)
  if (!existsSync(KEY)) throw new Error('apple-certs/pass.key is missing — run `csr` first.')

  // Apple hands out DER. Convert only if it is not already PEM.
  const raw = readFileSync(cer)
  const isPem = raw.includes('BEGIN CERTIFICATE')
  const certPem = isPem
    ? raw
    : openssl(['x509', '-inform', 'DER', '-in', cer, '-outform', 'PEM'])

  const certPemPath = resolve(DIR, 'pass.pem')
  writeFileSync(certPemPath, certPem)

  // An empty export password keeps the .env one line shorter and protects nothing that
  // the .env itself does not already protect.
  openssl([
    'pkcs12',
    '-export',
    '-out',
    P12,
    '-inkey',
    KEY,
    '-in',
    certPemPath,
    '-passout',
    'pass:',
    // OpenSSL 3 defaults to AES-256; node-forge reads that fine, but legacy RC2 files
    // exported from Keychain are what most guides produce, so stay on the modern default.
    '-name',
    'Stampie Pass Type ID',
  ])

  console.log('\n✓ apple-certs/pass.p12 written\n')
  printEnv()
}

function printEnv(): void {
  if (!existsSync(P12)) throw new Error('apple-certs/pass.p12 is missing — run `pack` first.')

  const base64 = readFileSync(P12).toString('base64')
  const subject = openssl(['x509', '-in', resolve(DIR, 'pass.pem'), '-noout', '-subject'])
    .toString()
    .trim()

  const passTypeId = /UID\s*=\s*([^,/\n]+)/.exec(subject)?.[1]?.trim() ?? ''
  const teamId = /OU\s*=\s*([^,/\n]+)/.exec(subject)?.[1]?.trim() ?? ''

  console.log(
    [
      'Put these into .env (or the Vercel project settings):',
      '',
      `APPLE_PASS_TYPE_ID="${passTypeId}"`,
      `APPLE_TEAM_ID="${teamId}"`,
      // Empty on purpose. Deployment UIs that reject empty values can drop the line
      // entirely — a missing variable and an empty one are read the same way.
      'APPLE_PASS_CERTIFICATE_PASSWORD=""',
      `APPLE_PASS_CERTIFICATE="${base64}"`,
      '',
      `(read from ${subject})`,
      '',
    ].join('\n'),
  )
}

/**
 * Diagnoses the configured environment the way the server will read it. Deliberately
 * implemented with OpenSSL rather than by importing the app's own loader: the app module
 * is `server-only` and cannot be imported from a plain script, and the failures worth
 * catching here — wrong password, mismatched ids, expired certificate — are exactly the
 * ones a certificate dump shows.
 */
async function check(): Promise<void> {
  const { loadEnvConfig } = await import('@next/env')
  loadEnvConfig(process.cwd())

  const base64 = (process.env.APPLE_PASS_CERTIFICATE ?? '').replace(/\s+/g, '')
  const password = process.env.APPLE_PASS_CERTIFICATE_PASSWORD ?? ''
  const passTypeId = (process.env.APPLE_PASS_TYPE_ID ?? '').trim()
  const teamId = (process.env.APPLE_TEAM_ID ?? '').trim()

  if (!base64) throw new Error('APPLE_PASS_CERTIFICATE is empty — nothing to check.')

  // OpenSSL wants a path for -in, and stdin paths are not portable to the Windows build.
  const tmp = resolve(tmpdir(), `stampie-pass-check-${process.pid}.p12`)
  writeFileSync(tmp, Buffer.from(base64, 'base64'))
  let dump: string
  try {
    dump = openssl(['pkcs12', '-in', tmp, '-clcerts', '-nokeys', '-passin', `pass:${password}`])
      .toString()
  } finally {
    rmSync(tmp, { force: true })
  }

  const subject = openssl(['x509', '-noout', '-subject', '-enddate'], Buffer.from(dump)).toString()
  const certUid = /UID\s*=\s*([^,/\n]+)/.exec(subject)?.[1]?.trim() ?? ''
  const certTeam = /OU\s*=\s*([^,/\n]+)/.exec(subject)?.[1]?.trim() ?? ''

  const problems: string[] = []
  if (certUid && certUid !== passTypeId) {
    problems.push(`APPLE_PASS_TYPE_ID="${passTypeId}" but the certificate says "${certUid}"`)
  }
  if (certTeam && certTeam !== teamId) {
    problems.push(`APPLE_TEAM_ID="${teamId}" but the certificate says "${certTeam}"`)
  }

  console.log(['', ...subject.trim().split('\n').map((l) => `  ${l}`), ''].join('\n'))

  if (problems.length > 0) {
    console.error(`✖ ${problems.join('\n✖ ')}\n`)
    process.exit(1)
  }
  console.log('✓ Certificate opens, and the ids match the environment.\n')
}

try {
  await main()
} catch (error) {
  console.error(`\n✖ ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}
