import type { CardDesignInput, CardKind } from '@/lib/cards/schema'
import { appUrl } from '@/lib/app-url'
import { readAppleWalletCredentials } from './apple-pass-builder'

/**
 * The seam between the card designer and pass generation.
 *
 * Everything above this interface — the editor, the preview, the test card flow — is
 * independent of whether the passes handed out are signed.
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
  /**
   * Per-pass secret for Apple's web service, resolved by the caller for the same reason
   * the assets are: keeping the builder free of IO is what lets it be unit-tested.
   *
   * Absent means the pass ships without `webServiceURL`, and Wallet never asks for
   * updates — correct for a throwaway test card, and the only option without a certificate.
   */
  appleAuthToken?: string | null
  /**
   * The shop's current message to pass holders. Carried on the pass rather than pushed
   * separately, because Apple has no separate channel — see `buildPassJson`.
   */
  message?: string | null
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
    // Not just "an env var is set": the .p12 is actually opened and its UID/OU checked
    // against APPLE_PASS_TYPE_ID/APPLE_TEAM_ID. A certificate that cannot be parsed or
    // does not match reports as unconfigured, with the reason on the server log — Wallet
    // gives no diagnostics of its own.
    apple: readAppleWalletCredentials() !== null,
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
