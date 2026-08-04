import 'server-only'
import { createSign } from 'node:crypto'
import { buildLoyaltyClass, buildLoyaltyObject } from '@/lib/cards/google-loyalty'
import { walletHeroUrl, walletLogoUrl } from '@/lib/wallet/image-urls'
import type { CardDesign, PassBuilderConfig } from './pass-builder'

/**
 * Real Google Wallet save links.
 *
 * A "Save to Google Wallet" link is an RS256-signed JWT carrying the LoyaltyClass and
 * LoyaltyObject. Google verifies the signature against the public key of the service
 * account named in `iss` — an unsigned or fake signature is rejected outright, which is
 * why the mock builder produces a link that opens an error page.
 *
 * Signing is done with node's crypto rather than a JWT library: it is one createSign call
 * and keeps a private-key code path free of third-party dependencies.
 *
 * Required environment:
 *   GOOGLE_ISSUER_ID                    numeric issuer id from the Google Wallet console
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL        ...@...iam.gserviceaccount.com
 *   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY  PEM, "\n" escapes are unescaped automatically
 */

export interface GoogleWalletCredentials {
  issuerId: string
  clientEmail: string
  privateKey: string
}

/**
 * Issuer ids are numeric. The Google Pay & Wallet Console shows a *Merchant ID* far more
 * prominently (alphanumeric, `BCR2DN6…`), and pasting that one produces a class id Google
 * rejects with nothing but "Something went wrong" — so catch it here instead.
 */
export function isValidIssuerId(value: string): boolean {
  return /^\d{10,25}$/.test(value)
}

export function readGoogleWalletCredentials(): GoogleWalletCredentials | null {
  const issuerId = process.env.GOOGLE_ISSUER_ID?.trim()
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim()
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY

  if (!issuerId || !clientEmail || !rawKey) return null

  if (!isValidIssuerId(issuerId)) {
    // eslint-disable-next-line no-console
    console.error(
      `[google-wallet] GOOGLE_ISSUER_ID="${issuerId}" is not a numeric issuer id. ` +
        'This is most likely the Merchant ID from the Google Pay section of the console. ' +
        'The issuer id is under "Google Wallet API" and consists of digits only.',
    )
    return null
  }

  // Env vars cannot hold real newlines on most platforms, so the PEM arrives escaped.
  const privateKey = rawKey.includes('\\n') ? rawKey.replace(/\\n/g, '\n') : rawKey
  if (!privateKey.includes('BEGIN')) return null

  return { issuerId, clientEmail, privateKey }
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url')
}

/**
 * Builds and signs the Save-to-Wallet JWT.
 *
 * The full class definition travels inside the JWT, so no separate API call is needed to
 * create it — Google provisions the class on first save.
 */
export function buildSignedSaveUrl(
  design: CardDesign,
  serial: string,
  config: PassBuilderConfig,
  credentials: GoogleWalletCredentials,
): string {
  const ctx = {
    issuerId: credentials.issuerId,
    classSuffix: `card_${design.cardId}`,
    objectSuffix: `sn_${serial}`,
    issuerName: design.organizationName,
    serial,
    currentStamps: design.currentStamps,
    barcodeMessage: `${config.appUrl}/s/${serial}`,
    // Never the raw asset: it is 160x50 for Apple, which Google would crop to a sliver.
    logoUrl: null,
    heroUrl: walletHeroUrl(config.appUrl, design.cardId, design, design.currentStamps),
    fallbackLogoUrl: walletLogoUrl(config.appUrl, design.cardId, design),
  }

  const payload = {
    iss: credentials.clientEmail,
    aud: 'google',
    typ: 'savetowallet',
    iat: Math.floor(Date.now() / 1000),
    origins: [config.appUrl],
    payload: {
      loyaltyClasses: [buildLoyaltyClass(design, ctx)],
      loyaltyObjects: [buildLoyaltyObject(design, ctx)],
    },
  }

  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const body = base64url(JSON.stringify(payload))
  const signingInput = `${header}.${body}`

  const signature = createSign('RSA-SHA256')
    .update(signingInput)
    .sign(credentials.privateKey)
    .toString('base64url')

  return `https://pay.google.com/gp/v/save/${signingInput}.${signature}`
}
