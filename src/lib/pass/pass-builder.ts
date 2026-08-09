import type { CardDesignInput, CardKind } from '@/lib/cards/schema'
import { appUrl } from '@/lib/app-url'

/**
 * The seam between the card designer and pass generation.
 *
 * Signing (`.pkpass` PKCS#7 with the Apple pass certificate) and the real Google Wallet
 * JWT come later. Everything above this interface — the editor, the preview, the test
 * card flow — is finished and will not change when the real implementation lands.
 */
export interface PassBuilder {
  /** Returns the raw bytes of a `.pkpass` bundle. */
  buildApplePass(design: CardDesign, serial: string): Promise<Buffer>
  /** Returns a `https://pay.google.com/gp/v/save/<jwt>` link. */
  buildGoogleSaveUrl(design: CardDesign, serial: string): Promise<string>
}

/**
 * Everything a builder needs beyond the design itself. Kept as one object so the
 * interface signature above stays exactly as specified.
 */
export interface CardDesign extends CardDesignInput {
  cardId: string
  /** Decides the wallet pass type: loyalty/storeCard for STAMP, offer/coupon for COUPON. */
  kind: CardKind
  organizationName: string
  /** COUPON only: a redeemed coupon is issued in its retired state, not as a fresh one. */
  redeemed?: boolean
  /**
   * Google class id suffix. Defaults to `card_<cardId>`. A stamp card that hands out
   * coupons needs a second one — the same id cannot name both a loyaltyClass and an
   * offerClass without becoming a puzzle to debug.
   */
  classSuffix?: string
  /** Stamps to render into the strip for this specific pass. */
  currentStamps: number
  /** Resolved asset bytes — the builder must not reach into storage itself. */
  assets: PassAssets
}

export interface PassAssets {
  /** icon.png @1x/@2x/@3x — mandatory for Apple. */
  icon: ScaledPng | null
  logo: ScaledPng | null
  /** Custom stamp icon master, if the design uses one. */
  stampIcon: Buffer | null
  /** Hero / strip background image, if set. */
  hero: Buffer | null
  logoUrl: string | null
  heroUrl: string | null
}

export interface ScaledPng {
  '1x': Buffer
  '2x'?: Buffer
  '3x'?: Buffer
}

export interface PassBuilderConfig {
  passTypeIdentifier: string
  teamIdentifier: string
  /** Base URL used for barcode payloads. */
  appUrl: string
  googleIssuerId: string
}

/**
 * Whether a pass for the given platform can actually be installed on a phone.
 *
 * Both wallets refuse unsigned passes, so without credentials the test card resolves,
 * downloads and then fails at the wallet — which looks like a broken link. The editor
 * surfaces this instead of letting the user find out by scanning.
 */
export interface PassSigningStatus {
  apple: boolean
  google: boolean
}

export function passSigningStatus(): PassSigningStatus {
  return {
    // Requires an Apple Developer Program membership: Pass Type ID certificate plus the
    // WWDR intermediate, and a PKCS#7 detached signature over manifest.json.
    apple: Boolean(process.env.APPLE_PASS_CERTIFICATE && process.env.APPLE_PASS_CERTIFICATE_PASSWORD),
    // Deliberately mirrors readGoogleWalletCredentials(), including the numeric issuer-id
    // check — a Merchant ID pasted in its place must not report as "configured".
    google: Boolean(
      process.env.GOOGLE_ISSUER_ID &&
        /^\d{10,25}$/.test(process.env.GOOGLE_ISSUER_ID.trim()) &&
        process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
        process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
    ),
  }
}

export function readPassBuilderConfig(): PassBuilderConfig {
  return {
    passTypeIdentifier: process.env.APPLE_PASS_TYPE_ID ?? 'pass.de.stampie.stampcard',
    teamIdentifier: process.env.APPLE_TEAM_ID ?? 'DEV0000000',
    appUrl: appUrl(),
    googleIssuerId: process.env.GOOGLE_ISSUER_ID ?? '3388000000022000000',
  }
}
