import 'server-only'
import { createSign } from 'node:crypto'
import { appUrl } from '@/lib/app-url'
import type { CardDesignInput } from '@/lib/cards/schema'
import {
  readGoogleWalletCredentials,
  type GoogleWalletCredentials,
} from '@/lib/pass/google-pass-builder'
import { getAccessToken, WALLET_API } from '@/lib/wallet/google-sync'
import { walletLogoUrl } from '@/lib/wallet/image-urls'
import type { BusinessPassRole } from './apple-pass-json'
import {
  buildBusinessGenericClass,
  buildBusinessGenericObject,
  businessObjectId,
} from './google-generic'
import type { BusinessCompany, BusinessContact } from './schema'

/**
 * „Zu Google Wallet hinzufügen" für die Visitenkarte, und das Nachziehen von Änderungen.
 *
 * Gleicher Weg wie bei der Stempelkarte: ein signiertes JWT, das Klasse und Objekt mitbringt,
 * Google legt beides beim ersten Speichern an. Ohne Zugangsdaten entsteht ein unsigniertes
 * JWT — der Ablauf bleibt prüfbar, nur das Speichern bei Google schlägt fehl.
 *
 * Eigene Datei statt einer Weiche in `lib/pass/google-pass-builder.ts`, damit dort für
 * Stempelkarte und Gutschein nichts angefasst werden muss.
 */

export interface BusinessGoogleInput {
  cardId: string
  design: CardDesignInput
  contact: BusinessContact
  company: BusinessCompany | null
  role: BusinessPassRole
  serial: string
  scanUrl: string
  privacyUrl: string
  voided?: boolean
}

const FALLBACK_ISSUER_ID = '3388000000022000000'

function savePayload(input: BusinessGoogleInput, issuerId: string): Record<string, unknown> {
  const base = appUrl()
  return {
    genericClasses: [buildBusinessGenericClass(issuerId, input.cardId)],
    genericObjects: [
      buildBusinessGenericObject(input.design, input.contact, input.company, {
        issuerId,
        cardId: input.cardId,
        serial: input.serial,
        role: input.role,
        scanUrl: input.scanUrl,
        privacyUrl: input.privacyUrl,
        logoUrl: walletLogoUrl(base, input.cardId, input.design),
      }),
    ],
  }
}

function sign(signingInput: string, credentials: GoogleWalletCredentials): string {
  return createSign('RSA-SHA256').update(signingInput).sign(credentials.privateKey).toString('base64url')
}

export function buildBusinessGoogleSaveUrl(input: BusinessGoogleInput): string {
  const credentials = readGoogleWalletCredentials()
  const base = appUrl()
  const claims = {
    iss: credentials?.clientEmail ?? 'mock@stampie.iam.gserviceaccount.com',
    aud: 'google',
    typ: 'savetowallet',
    iat: Math.floor(Date.now() / 1000),
    origins: [base],
    payload: savePayload(input, credentials?.issuerId ?? FALLBACK_ISSUER_ID),
  }

  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url')
  const signingInput = `${header}.${body}`
  const signature = credentials ? sign(signingInput, credentials) : 'MOCK_SIGNATURE'

  return `https://pay.google.com/gp/v/save/${signingInput}.${signature}`
}

export interface BusinessGoogleSyncSummary {
  updated: number
  missing: number
  failed: number
}

/**
 * Schreibt die aktuelle Fassung auf Objekte, die schon in Google Wallet liegen.
 *
 * Wir wissen nicht, welcher Pass bei Google gespeichert wurde und welcher bei Apple — die
 * Seriennummer ist dieselbe Art. Also wird für jeden versucht; ein 404 heißt „nie bei
 * Google gelandet" und ist kein Fehler.
 */
export async function syncBusinessGoogleObjects(
  inputs: BusinessGoogleInput[],
): Promise<BusinessGoogleSyncSummary> {
  const summary: BusinessGoogleSyncSummary = { updated: 0, missing: 0, failed: 0 }
  const credentials = readGoogleWalletCredentials()
  if (!credentials || inputs.length === 0) return summary

  const token = await getAccessToken(credentials.clientEmail, credentials.privateKey)
  const base = appUrl()

  const BATCH = 10
  for (let i = 0; i < inputs.length; i += BATCH) {
    const batch = inputs.slice(i, i + BATCH)
    const results = await Promise.all(
      batch.map(async (input) => {
        const object = buildBusinessGenericObject(input.design, input.contact, input.company, {
          issuerId: credentials.issuerId,
          cardId: input.cardId,
          serial: input.serial,
          role: input.role,
          scanUrl: input.scanUrl,
          privacyUrl: input.privacyUrl,
          logoUrl: walletLogoUrl(base, input.cardId, input.design),
          voided: input.voided ?? false,
        })
        const id = businessObjectId(credentials.issuerId, input.serial)
        try {
          const response = await fetch(`${WALLET_API}/genericObject/${encodeURIComponent(id)}`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(object),
          })
          if (response.status === 404) return 'missing' as const
          if (!response.ok) {
            // eslint-disable-next-line no-console
            console.error(`[google-wallet] business object ${id}: ${response.status} ${await response.text()}`)
            return 'failed' as const
          }
          return 'updated' as const
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error(`[google-wallet] business object ${id} threw`, error)
          return 'failed' as const
        }
      }),
    )
    for (const r of results) summary[r]++
  }
  return summary
}
