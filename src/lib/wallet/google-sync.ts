import 'server-only'
import { createSign } from 'node:crypto'
import { readGoogleWalletCredentials } from '@/lib/pass/google-pass-builder'
import { buildLoyaltyClass } from '@/lib/cards/google-loyalty'
import { buildOfferClass } from '@/lib/cards/google-offer'
import { appUrl } from '@/lib/app-url'
import { walletHeroUrl, walletLogoUrl } from './image-urls'
import type { CardDesignInput, CardKind } from '@/lib/cards/schema'

/**
 * Pushes a new stamp count to a card that already lives in Google Wallet.
 *
 * Google is the easy half of the update story: one authenticated PATCH and Google
 * distributes the change to the device. (Apple cannot do this — there the whole pass has
 * to be rebuilt and pushed via APNs, which is why `strip.png` is server-rendered.)
 *
 * Authentication is the JWT-bearer flow: sign an assertion with the service-account key,
 * exchange it for a short-lived access token, then call the Wallet API.
 */

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const WALLET_API = 'https://walletobjects.googleapis.com/walletobjects/v1'
const SCOPE = 'https://www.googleapis.com/auth/wallet_object.issuer'

function base64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url')
}

interface CachedToken {
  token: string
  expiresAt: number
}

let cached: CachedToken | null = null

async function getAccessToken(clientEmail: string, privateKey: string): Promise<string> {
  // Tokens last an hour; re-minting one per stamp would add a round trip to every scan.
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token

  const now = Math.floor(Date.now() / 1000)
  const claim = {
    iss: clientEmail,
    scope: SCOPE,
    aud: TOKEN_ENDPOINT,
    exp: now + 3600,
    iat: now,
  }

  const signingInput = `${base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64url(
    JSON.stringify(claim),
  )}`
  const signature = createSign('RSA-SHA256').update(signingInput).sign(privateKey).toString('base64url')

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${signingInput}.${signature}`,
    }),
  })

  if (!response.ok) {
    throw new Error(`Google token exchange failed: ${response.status} ${await response.text()}`)
  }

  const body = (await response.json()) as { access_token: string; expires_in: number }
  cached = { token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 }
  return body.access_token
}

/**
 * Pushes the current design onto the LoyaltyClass.
 *
 * A class inlined in a save-JWT is only created *once*. Every later save with the same
 * class id reuses whatever Google stored the first time, so without this call a shop owner
 * could change colours, publish, and watch nothing happen on cards already in the wild.
 */
export async function syncGoogleClass(
  cardId: string,
  design: CardDesignInput,
  organizationName: string,
  kind: CardKind = 'STAMP',
): Promise<GoogleSyncResult> {
  const credentials = readGoogleWalletCredentials()
  if (!credentials) return { status: 'not_configured' }

  const classId = `${credentials.issuerId}.card_${cardId}`
  const base = appUrl()

  const ctx = {
    issuerId: credentials.issuerId,
    classSuffix: `card_${cardId}`,
    objectSuffix: 'unused',
    issuerName: organizationName,
    serial: 'unused',
    currentStamps: 0,
    barcodeMessage: `${base}/s/unused`,
    logoUrl: null,
    heroUrl: walletHeroUrl(base, cardId, design, 0),
    fallbackLogoUrl: walletLogoUrl(base, cardId, design),
  }

  // Coupons live under a different resource entirely — patching an offer class through
  // the loyalty endpoint is a 404, not a partial update.
  const isCoupon = kind === 'COUPON'
  const resource = isCoupon ? 'offerClass' : 'loyaltyClass'
  const body = isCoupon ? buildOfferClass(design, ctx) : buildLoyaltyClass(design, ctx)

  try {
    const accessToken = await getAccessToken(credentials.clientEmail, credentials.privateKey)
    const response = await fetch(`${WALLET_API}/${resource}/${encodeURIComponent(classId)}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (response.status === 404) return { status: 'not_found' }
    if (!response.ok) {
      // Callers treat a failed class sync as non-fatal, so without this line the reason
      // never surfaces anywhere.
      const message = `${response.status} ${await response.text()}`
      // eslint-disable-next-line no-console
      console.error(`[google-wallet] class ${classId} update failed: ${message}`)
      return { status: 'error', message }
    }
    return { status: 'updated' }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown'
    // eslint-disable-next-line no-console
    console.error(`[google-wallet] class ${classId} update threw: ${message}`)
    return { status: 'error', message }
  }
}

export type GoogleSyncResult =
  | { status: 'updated' }
  | { status: 'not_configured' }
  | { status: 'not_found' }
  | { status: 'error'; message: string }

/**
 * Updates the stamp counter and the hero image of a saved card.
 *
 * A card the customer never saved simply does not exist on Google's side — that is a
 * normal outcome, not a failure, so it is reported separately from a real error.
 */
/**
 * Retires a redeemed coupon in the customer's wallet.
 *
 * The Offers API has no "redeemed" flag — `state: EXPIRED` is the only lever, and it moves
 * the pass into the customer's expired passes so it cannot be presented again. Whether it
 * was actually redeemed stays our record (`IssuedPass.redeemedAt`); this call is only the
 * visible half.
 */
export async function expireGoogleOffer(serial: string): Promise<GoogleSyncResult> {
  const credentials = readGoogleWalletCredentials()
  if (!credentials) return { status: 'not_configured' }

  const objectId = `${credentials.issuerId}.sn_${serial}`

  try {
    const accessToken = await getAccessToken(credentials.clientEmail, credentials.privateKey)
    const response = await fetch(`${WALLET_API}/offerObject/${encodeURIComponent(objectId)}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'EXPIRED' }),
    })

    if (response.status === 404) return { status: 'not_found' }
    if (!response.ok) {
      return { status: 'error', message: `${response.status} ${await response.text()}` }
    }
    return { status: 'updated' }
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : 'unknown' }
  }
}

export async function syncGoogleStampCount(
  cardId: string,
  serial: string,
  stamps: number,
  design: CardDesignInput,
): Promise<GoogleSyncResult> {
  const credentials = readGoogleWalletCredentials()
  if (!credentials) return { status: 'not_configured' }

  const objectId = `${credentials.issuerId}.sn_${serial}`

  try {
    const accessToken = await getAccessToken(credentials.clientEmail, credentials.privateKey)

    const response = await fetch(`${WALLET_API}/loyaltyObject/${encodeURIComponent(objectId)}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        loyaltyPoints: { label: design.stampLabel, balance: { int: stamps } },
        // New stamp count means a new URL, so Google re-fetches instead of using its cache.
        heroImage: {
          sourceUri: { uri: walletHeroUrl(appUrl(), cardId, design, stamps) },
          contentDescription: { defaultValue: { language: 'de', value: 'Stempelkarte' } },
        },
      }),
    })

    if (response.status === 404) return { status: 'not_found' }
    if (!response.ok) {
      return { status: 'error', message: `${response.status} ${await response.text()}` }
    }
    return { status: 'updated' }
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : 'unknown' }
  }
}

/**
 * Dieselbe Nachricht, aber nur an ausgewählte Pässe.
 *
 * Google hängt die Meldung sonst an die Klasse, und die gilt für alle. Für eine Gruppe
 * muss sie ans einzelne Objekt — dieselbe Route, nur eine Ebene tiefer.
 *
 * Ein 404 ist hier der Normalfall und kein Fehler: die meisten Kunden haben die Karte im
 * Apple Wallet, ein Google-Objekt existiert für sie nie. Gezählt wird deshalb, wen es
 * wirklich erreicht hat.
 */
export async function sendGoogleWalletMessageToPasses(
  serials: string[],
  message: { headline: string | null; body: string },
  kind: CardKind = 'STAMP',
): Promise<{ delivered: number; failed: number; configured: boolean }> {
  const credentials = readGoogleWalletCredentials()
  if (!credentials) return { delivered: 0, failed: 0, configured: false }
  if (serials.length === 0) return { delivered: 0, failed: 0, configured: true }

  const resource = kind === 'COUPON' ? 'offerObject' : 'loyaltyObject'
  let accessToken: string
  try {
    accessToken = await getAccessToken(credentials.clientEmail, credentials.privateKey)
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(`[google-wallet] token for group message failed: ${messageOf(e)}`)
    return { delivered: 0, failed: serials.length, configured: true }
  }

  let delivered = 0
  let failed = 0

  for (const serial of serials) {
    const objectId = `${credentials.issuerId}.sn_${serial}`
    try {
      const response = await fetch(
        `${WALLET_API}/${resource}/${encodeURIComponent(objectId)}/addMessage`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: {
              header: message.headline ?? undefined,
              body: message.body,
              messageType: 'TEXT_AND_NOTIFY',
            },
          }),
        },
      )

      // Kein Google-Objekt zu diesem Pass — der Kunde hat die Karte woanders.
      if (response.status === 404) continue
      if (!response.ok) {
        failed++
        // eslint-disable-next-line no-console
        console.error(
          `[google-wallet] message for ${objectId} failed: ${response.status} ${await response.text()}`,
        )
        continue
      }
      delivered++
    } catch (e) {
      failed++
      // eslint-disable-next-line no-console
      console.error(`[google-wallet] message for ${objectId} threw: ${messageOf(e)}`)
    }
  }

  return { delivered, failed, configured: true }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown'
}

/**
 * Sends a message to everyone holding a card of this programme.
 *
 * Google's counterpart to Apple's changed-field trick, and much the better one: the message
 * goes on the *class*, so a single call reaches every holder instead of one push per pass.
 * `TEXT_AND_NOTIFY` is what makes it a notification — plain `TEXT` only files it on the
 * back of the pass, where nobody would look without being told.
 *
 * Coupons live under a different resource, same as everywhere else in this file.
 */
export async function sendGoogleWalletMessage(
  cardId: string,
  message: { headline: string | null; body: string },
  kind: CardKind = 'STAMP',
): Promise<GoogleSyncResult> {
  const credentials = readGoogleWalletCredentials()
  if (!credentials) return { status: 'not_configured' }

  const classId = `${credentials.issuerId}.card_${cardId}`
  const resource = kind === 'COUPON' ? 'offerClass' : 'loyaltyClass'

  try {
    const accessToken = await getAccessToken(credentials.clientEmail, credentials.privateKey)
    const response = await fetch(
      `${WALLET_API}/${resource}/${encodeURIComponent(classId)}/addMessage`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            header: message.headline ?? undefined,
            body: message.body,
            messageType: 'TEXT_AND_NOTIFY',
          },
        }),
      },
    )

    if (response.status === 404) return { status: 'not_found' }
    if (!response.ok) {
      const detail = `${response.status} ${await response.text()}`
      // eslint-disable-next-line no-console
      console.error(`[google-wallet] message for ${classId} failed: ${detail}`)
      return { status: 'error', message: detail }
    }
    return { status: 'updated' }
  } catch (e) {
    const detail = e instanceof Error ? e.message : 'unknown'
    // eslint-disable-next-line no-console
    console.error(`[google-wallet] message for ${classId} threw: ${detail}`)
    return { status: 'error', message: detail }
  }
}
