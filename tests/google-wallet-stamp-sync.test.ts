import { generateKeyPairSync } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CardDesignInput } from '@/lib/cards/schema'

/**
 * Der PATCH, mit dem ein Stempel in Google Wallet ankommt.
 *
 * Hintergrund: der Pass wird beim Ausgeben mit `loyaltyPoints.balance.string` ("1/7")
 * angelegt (siehe `buildLoyaltyObject`). In Googles `LoyaltyPointsBalance` darf genau
 * eines der Felder gesetzt sein. Als das Update hier noch `{ int: stamps }` schickte,
 * lehnte Google die ganze Anfrage ab — samt dem `heroImage` im selben Body. Ergebnis:
 * Kasse und Apple Wallet zählten hoch, die Google-Karte des Kunden blieb tagelang stehen,
 * und weil das Ergebnis weggeworfen wird, stand davon nirgends etwas.
 *
 * Diese Datei hält die beiden Seiten zusammen: schreibt jemand das eine Format um, ohne
 * das andere mitzuziehen, fällt es hier auf statt beim Kunden.
 */

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
})

const design = {
  stampLabel: 'Schnitte',
  stampGoal: 7,
  foregroundColor: '#ffffff',
  backgroundColor: '#000000',
  stampIcon: 'star',
  emptyStampStyle: 'outline',
  stampIconAssetId: null,
  heroAssetId: null,
} as unknown as CardDesignInput

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubEnv('GOOGLE_ISSUER_ID', '3388000000012345678')
  vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL', 'stampie@example.iam.gserviceaccount.com')
  vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY', privateKey as string)
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://stampie-backend.vercel.app')

  fetchMock.mockReset()
  fetchMock.mockImplementation(async (url: string) => {
    if (String(url).includes('oauth2.googleapis.com')) {
      return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 })
    }
    return new Response('{}', { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

/** Der PATCH auf das LoyaltyObject — der Token-Aufruf davor interessiert hier nicht. */
function patchBody(): Record<string, any> {
  const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('/loyaltyObject/'))
  expect(call, 'kein PATCH auf das LoyaltyObject').toBeTruthy()
  expect(call![1].method).toBe('PATCH')
  return JSON.parse(call![1].body as string)
}

describe('syncGoogleStampCount', () => {
  it('schickt den Stand als String "Stand/Ziel" — dasselbe Format wie beim Ausgeben', async () => {
    const { syncGoogleStampCount } = await import('@/lib/wallet/google-sync')

    const result = await syncGoogleStampCount('c1', 'K-1', 3, design)

    expect(result.status).toBe('updated')
    expect(patchBody().loyaltyPoints).toEqual({ label: 'Schnitte', balance: { string: '3/7' } })
  })

  it('setzt niemals ein zweites balance-Feld — Google lehnt den ganzen PATCH sonst ab', async () => {
    const { syncGoogleStampCount } = await import('@/lib/wallet/google-sync')

    await syncGoogleStampCount('c1', 'K-1', 3, design)

    expect(Object.keys(patchBody().loyaltyPoints.balance)).toEqual(['string'])
  })

  it('deckelt am Ziel, statt "9/7" zu behaupten', async () => {
    const { syncGoogleStampCount } = await import('@/lib/wallet/google-sync')

    await syncGoogleStampCount('c1', 'K-1', 9, design)

    expect(patchBody().loyaltyPoints.balance.string).toBe('7/7')
  })

  it('schickt eine neue Hero-URL mit, sonst zeigt Google die alte Stempelreihe weiter', async () => {
    const { syncGoogleStampCount } = await import('@/lib/wallet/google-sync')

    await syncGoogleStampCount('c1', 'K-1', 3, design)

    expect(patchBody().heroImage.sourceUri.uri).toContain('/api/wallet/hero/c1?s=3')
  })

  it('meldet eine Absage von Google, statt sie zu verschlucken', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('oauth2.googleapis.com')) {
        return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 })
      }
      return new Response('Only one balance field may be set.', { status: 400 })
    })
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { syncGoogleStampCount } = await import('@/lib/wallet/google-sync')

    const result = await syncGoogleStampCount('c1', 'K-1', 3, design)

    expect(result.status).toBe('error')
    // Die Aufrufer werfen das Ergebnis weg; ohne diese Zeile bliebe die Absage unsichtbar.
    expect(logged).toHaveBeenCalled()
    logged.mockRestore()
  })
})
