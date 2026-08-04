import 'server-only'
import { createHash } from 'node:crypto'
import { buildPassJson } from '@/lib/cards/apple-pass-json'
import { buildLoyaltyClass, buildLoyaltyObject } from '@/lib/cards/google-loyalty'
import { walletHeroUrl, walletLogoUrl } from '@/lib/wallet/image-urls'
import { renderHeroImage, renderStripImageSet } from '@/lib/cards/render-strip'
import { createZip, type ZipEntry } from './zip'
import { buildSignedSaveUrl, readGoogleWalletCredentials } from './google-pass-builder'
import {
  readPassBuilderConfig,
  type CardDesign,
  type PassBuilder,
  type PassBuilderConfig,
} from './pass-builder'

/**
 * Mock implementation.
 *
 * It produces a *real* .pkpass archive — correct file names, correct pass.json, all three
 * strip resolutions, a correct manifest.json of SHA-1 digests — and omits only the
 * `signature` entry, because signing needs the Apple certificate. That means the bundle
 * can be inspected byte for byte today and the real builder is a strictly additive change.
 *
 * The Google side returns a save URL carrying an unsigned JWT with the real
 * LoyaltyClass/LoyaltyObject payload, for the same reason.
 */
export class MockPassBuilder implements PassBuilder {
  constructor(private readonly config: PassBuilderConfig = readPassBuilderConfig()) {}

  private barcodeMessage(serial: string): string {
    return `${this.config.appUrl}/s/${serial}`
  }

  async buildApplePass(design: CardDesign, serial: string): Promise<Buffer> {
    const passJson = buildPassJson(design, {
      serial,
      currentStamps: design.currentStamps,
      organizationName: design.organizationName,
      passTypeIdentifier: this.config.passTypeIdentifier,
      teamIdentifier: this.config.teamIdentifier,
      barcodeMessage: this.barcodeMessage(serial),
    })

    // The stamp row is regenerated for this exact stamp count — this is the whole reason
    // the renderer is server-side.
    const strip = await renderStripImageSet(design, design.currentStamps, {
      customIconPng: design.assets.stampIcon,
      backgroundPng: design.assets.hero,
    })

    const files: ZipEntry[] = [
      { name: 'pass.json', data: Buffer.from(JSON.stringify(passJson, null, 2), 'utf8') },
      { name: 'strip.png', data: strip['1x'] },
      { name: 'strip@2x.png', data: strip['2x'] },
      { name: 'strip@3x.png', data: strip['3x'] },
    ]

    const icon = design.assets.icon
    if (icon) {
      files.push({ name: 'icon.png', data: icon['1x'] })
      if (icon['2x']) files.push({ name: 'icon@2x.png', data: icon['2x'] })
      if (icon['3x']) files.push({ name: 'icon@3x.png', data: icon['3x'] })
    }

    const logo = design.assets.logo
    if (logo) {
      files.push({ name: 'logo.png', data: logo['1x'] })
      if (logo['2x']) files.push({ name: 'logo@2x.png', data: logo['2x'] })
      if (logo['3x']) files.push({ name: 'logo@3x.png', data: logo['3x'] })
    }

    // manifest.json maps every file to its SHA-1. The real builder signs exactly this.
    const manifest: Record<string, string> = {}
    for (const f of files) {
      manifest[f.name] = createHash('sha1').update(f.data).digest('hex')
    }
    files.push({ name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8') })

    // NOTE: no `signature` entry — see class doc.
    return createZip(files)
  }

  async buildGoogleSaveUrl(design: CardDesign, serial: string): Promise<string> {
    // As soon as real credentials are configured, produce a properly signed link —
    // Google rejects anything else, so the mock below only ever opens an error page.
    const credentials = readGoogleWalletCredentials()
    if (credentials) {
      return buildSignedSaveUrl(design, serial, this.config, credentials)
    }

    const ctx = {
      issuerId: this.config.googleIssuerId,
      classSuffix: `card_${design.cardId}`,
      objectSuffix: `sn_${serial}`,
      issuerName: design.organizationName,
      serial,
      currentStamps: design.currentStamps,
      barcodeMessage: this.barcodeMessage(serial),
      // Never the raw asset: it is 160x50 for Apple, which Google would crop to a sliver.
      logoUrl: null,
      heroUrl: walletHeroUrl(this.config.appUrl, design.cardId, design, design.currentStamps),
      fallbackLogoUrl: walletLogoUrl(this.config.appUrl, design.cardId, design),
    }

    const payload = {
      iss: 'mock@stemply.iam.gserviceaccount.com',
      aud: 'google',
      typ: 'savetowallet',
      iat: Math.floor(Date.now() / 1000),
      origins: [this.config.appUrl],
      payload: {
        loyaltyClasses: [buildLoyaltyClass(design, ctx)],
        loyaltyObjects: [buildLoyaltyObject(design, ctx)],
      },
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
