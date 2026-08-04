import 'server-only'
import { createSign } from 'node:crypto'
import { readGoogleWalletCredentials } from '@/lib/pass/google-pass-builder'
import { buildLoyaltyClass, stampRowText, STAMP_ROW_FIELD } from '@/lib/cards/google-loyalty'
import { appUrl } from '@/lib/app-url'
import { walletHeroUrl, walletLogoUrl } from './image-urls'
import type { CardDesignInput } from '@/lib/cards/schema'

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
): Promise<GoogleSyncResult> {
  const credentials = readGoogleWalletCredentials()
  if (!credentials) return { status: 'not_configured' }

  const classId = `${credentials.issuerId}.card_${cardId}`
  const base = appUrl()

  const body = buildLoyaltyClass(design, {
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
  })

  try {
    const accessToken = await getAccessToken(credentials.clientEmail, credentials.privateKey)
    const response = await fetch(`${WALLET_API}/loyaltyClass/${encodeURIComponent(classId)}`, {
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
        // The row above the barcode is a text field, so it has to be rewritten too —
        // otherwise it freezes at whatever the count was when the card was saved.
        textModulesData: [
          {
            id: STAMP_ROW_FIELD,
            header: design.stampLabel,
            body: stampRowText(stamps, design.stampGoal),
          },
        ],
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
