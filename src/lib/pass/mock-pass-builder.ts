import 'server-only'
import { createHash } from 'node:crypto'
import { buildPassJson } from '@/lib/cards/apple-pass-json'
import { renderFallbackIconSet } from '@/lib/cards/render-icon'
import { renderHeroImage, renderStripImageSet } from '@/lib/cards/render-strip'
import { readAppleWalletCredentials, signManifest } from './apple-pass-builder'
import { applePassKitBaseUrl } from './apple-passkit-url'
import { createZip, type ZipEntry } from './zip'
import {
  buildGoogleContext,
  buildSavePayload,
  buildSignedSaveUrl,
  readGoogleWalletCredentials,
} from './google-pass-builder'
import {
  readPassBuilderConfig,
  type CardDesign,
  type PassBuilder,
  type PassBuilderConfig,
} from './pass-builder'

/**
 * The pass builder.
 *
 * It produces a real .pkpass archive — correct file names, correct pass.json, all three
 * strip resolutions, a correct manifest.json of SHA-1 digests. The `signature` entry is
 * added as soon as an Apple Pass Type ID certificate is configured; without one the
 * bundle is still emitted unsigned so the whole flow can be inspected byte for byte, and
 * only the final "add to Wallet" step fails.
 *
 * The Google side behaves the same way: a properly signed save link with credentials, an
 * unsigned one without.
 *
 * The name is historical — this used to be mock-only and the module path is referenced
 * from a dozen call sites.
 */
export class MockPassBuilder implements PassBuilder {
  constructor(private readonly config: PassBuilderConfig = readPassBuilderConfig()) {}

  private barcodeMessage(serial: string): string {
    return `${this.config.appUrl}/s/${serial}`
  }

  async buildApplePass(design: CardDesign, serial: string): Promise<Buffer> {
    // Only a signed pass can be updated: without a certificate there is no APNs identity
    // to push with, so advertising a web service would promise something we cannot keep.
    const authenticationToken = readAppleWalletCredentials() ? (design.appleAuthToken ?? null) : null

    const passJson = buildPassJson(design, {
      serial,
      currentStamps: design.currentStamps,
      organizationName: design.organizationName,
      passTypeIdentifier: this.config.passTypeIdentifier,
      teamIdentifier: this.config.teamIdentifier,
      barcodeMessage: this.barcodeMessage(serial),
      kind: design.kind,
      message: design.message ?? null,
      webService: authenticationToken
        ? { url: applePassKitBaseUrl(), authenticationToken }
        : null,
    })

    const files: ZipEntry[] = [
      { name: 'pass.json', data: Buffer.from(JSON.stringify(passJson, null, 2), 'utf8') },
    ]

    // A coupon has no stamp row. Bundling one would not just waste three renders — Wallet
    // would draw an empty grid across a pass that never counts anything.
    if (design.kind !== 'COUPON') {
      // Regenerated for this exact stamp count — the whole reason the renderer is server-side.
      const strip = await renderStripImageSet(design, design.currentStamps, {
        customIconPng: design.assets.stampIcon,
        backgroundPng: design.assets.hero,
      })
      files.push(
        { name: 'strip.png', data: strip['1x'] },
        { name: 'strip@2x.png', data: strip['2x'] },
        { name: 'strip@3x.png', data: strip['3x'] },
      )
    }

    // icon.png is the one file PassKit refuses to do without, and it refuses silently.
    // A card without an uploaded icon gets a monogram tile rather than a dead download.
    const icon =
      design.assets.icon ?? (await renderFallbackIconSet(design, design.organizationName))
    files.push({ name: 'icon.png', data: icon['1x'] })
    if (icon['2x']) files.push({ name: 'icon@2x.png', data: icon['2x'] })
    if (icon['3x']) files.push({ name: 'icon@3x.png', data: icon['3x'] })

    const logo = design.assets.logo
    if (logo) {
      files.push({ name: 'logo.png', data: logo['1x'] })
      if (logo['2x']) files.push({ name: 'logo@2x.png', data: logo['2x'] })
      if (logo['3x']) files.push({ name: 'logo@3x.png', data: logo['3x'] })
    }

    // manifest.json maps every file to its SHA-1. The signature covers exactly this.
    const manifest: Record<string, string> = {}
    for (const f of files) {
      manifest[f.name] = createHash('sha1').update(f.data).digest('hex')
    }
    const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8')
    files.push({ name: 'manifest.json', data: manifestBytes })

    const credentials = readAppleWalletCredentials()
    if (credentials) {
      files.push({ name: 'signature', data: signManifest(manifestBytes, credentials) })
    }

    return createZip(files)
  }

  async buildGoogleSaveUrl(design: CardDesign, serial: string): Promise<string> {
    // As soon as real credentials are configured, produce a properly signed link —
    // Google rejects anything else, so the mock below only ever opens an error page.
    const credentials = readGoogleWalletCredentials()
    if (credentials) {
      return buildSignedSaveUrl(design, serial, this.config, credentials)
    }

    const ctx = buildGoogleContext(design, serial, this.config, this.config.googleIssuerId)

    const payload = {
      iss: 'mock@stampie.iam.gserviceaccount.com',
      aud: 'google',
      typ: 'savetowallet',
      iat: Math.floor(Date.now() / 1000),
      origins: [this.config.appUrl],
      // Same payload builder as the signed path, so the mock cannot describe a pass the
      // real link would never produce.
      payload: buildSavePayload(design, ctx),
    }

    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    const body = b64url(JSON.stringify(payload))
    // Unsigned: the real builder signs with the service-account key.
    const jwt = `${header}.${body}.MOCK_SIGNATURE`

    return `https://pay.google.com/gp/v/save/${jwt}`
  }

  /** Convenience for the preview/e-mail path — the hero at Google's aspect ratio. */
  async buildHeroImage(design: CardDesign): Promise<Buffer> {
    return renderHeroImage(design, design.currentStamps, {
      customIconPng: design.assets.stampIcon,
      backgroundPng: design.assets.hero,
    })
  }
}

function b64url(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64url')
}

let instance: PassBuilder | null = null

export function getPassBuilder(): PassBuilder {
  if (!instance) instance = new MockPassBuilder()
  return instance
}

/** Test seam / swap-in point for the real signed builder. */
export function setPassBuilder(next: PassBuilder | null): void {
  instance = next
}
