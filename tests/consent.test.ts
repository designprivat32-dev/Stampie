import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Die Einwilligung in Werbenachrichten.
 *
 * Der teure Fehler wäre nicht, jemanden zu vergessen — es wäre, ohne Häkchen zu senden.
 * Deshalb prüft dieser Test vor allem die Abweisung: was nicht genau „1" ist, ist keine
 * Zustimmung, und wer nicht eingewilligt hat, taucht in keiner Empfängerabfrage auf.
 */

const reminderFindMany = vi.fn()
const passFindMany = vi.fn()

vi.mock('@/lib/db', () => ({
  prisma: {
    cardReminder: { findMany: (...a: unknown[]) => reminderFindMany(...a) },
    issuedPass: { findMany: (...a: unknown[]) => passFindMany(...a) },
    stampEvent: { groupBy: vi.fn() },
    cardReminderDelivery: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}))
vi.mock('@/lib/wallet/apple-sync', () => ({ pushAppleWalletUpdateForPasses: vi.fn() }))
vi.mock('@/lib/wallet/google-sync', () => ({ sendGoogleWalletMessageToPasses: vi.fn() }))

import {
  CONSENT_PARAM,
  CONSENT_TEXT,
  CONSENT_VERSION,
  consentRecord,
  hasConsentParam,
  isValidDeviceKey,
  RECOGNITION_TEXT,
  RECOGNITION_VERSION,
  recognitionRecord,
} from '@/lib/privacy/consent'
import { deliverDueReminders } from '@/lib/cards/reminder-service'

describe('hasConsentParam', () => {
  it('nimmt nur die exakte 1 als Zustimmung', () => {
    expect(hasConsentParam('1')).toBe(true)
  })

  it('weist alles andere ab', () => {
    for (const wert of ['0', 'true', 'ja', 'on', '', ' 1', '1 ', null]) {
      expect(hasConsentParam(wert)).toBe(false)
    }
  })

  it('heißt kurz genug, um an einen Link zu passen', () => {
    expect(CONSENT_PARAM).toBe('c')
  })
})

describe('consentRecord', () => {
  it('hält Zeitpunkt und Wortlaut fest', () => {
    const jetzt = new Date('2026-09-01T12:00:00.000Z')
    const record = consentRecord(jetzt)

    expect(record.marketingConsentAt).toBe(jetzt)
    // Ohne den Wortlaut ist der Nachweis keiner: später weiß sonst niemand mehr, wozu
    // jemand Ja gesagt hat.
    expect(record.marketingConsentText).toContain(CONSENT_TEXT)
  })

  it('vermerkt die Fassung, damit sich Textänderungen unterscheiden lassen', () => {
    expect(consentRecord().marketingConsentText).toMatch(new RegExp(`^v${CONSENT_VERSION}: `))
  })

  it('kündigt den Widerruf im Text selbst an', () => {
    expect(CONSENT_TEXT.toLowerCase()).toContain('widerrufen')
  })
})

describe('Erinnerungen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    reminderFindMany.mockResolvedValue([
      {
        id: 'r1',
        cardId: 'card-1',
        headline: null,
        body: 'Lange nicht gesehen.',
        intervalMinutes: 43200,
        card: { kind: 'STAMP' },
      },
    ])
    passFindMany.mockResolvedValue([])
  })

  it('fragt nur Pässe mit Einwilligung ab', async () => {
    await deliverDueReminders()

    expect(passFindMany.mock.calls[0]?.[0].where).toEqual({
      cardId: 'card-1',
      isTest: false,
      kind: 'STAMP',
      marketingConsentAt: { not: null },
    })
  })

  it('sendet nichts, wenn niemand eingewilligt hat', async () => {
    const result = await deliverDueReminders()

    expect(result.sent).toBe(0)
    expect(result.errors).toBe(0)
  })
})

/**
 * Die Wiedererkennung des Geräts.
 *
 * Der Schlüssel wirkt wie ein Ausweis: wer ihn mitschickt, bekommt genau diese Karte samt
 * Stempelstand. Ein zu kurzer oder erratener darf deshalb nicht als Kennung durchgehen.
 */
describe('isValidDeviceKey', () => {
  const gueltig = 'a'.repeat(43)

  it('nimmt einen langen base64url-Schlüssel an', () => {
    expect(isValidDeviceKey(gueltig)).toBe(true)
    expect(isValidDeviceKey('Ab-_0'.repeat(9))).toBe(true)
  })

  it('weist zu kurze Werte ab — die liessen sich durchprobieren', () => {
    expect(isValidDeviceKey('a'.repeat(31))).toBe(false)
    expect(isValidDeviceKey('kurz')).toBe(false)
    expect(isValidDeviceKey('')).toBe(false)
  })

  it('weist ueberlange Werte ab', () => {
    expect(isValidDeviceKey('a'.repeat(129))).toBe(false)
  })

  it('weist alles ab, was kein base64url ist', () => {
    for (const wert of ['a'.repeat(42) + '!', 'a'.repeat(42) + ' ', 'a'.repeat(42) + '/', null]) {
      expect(isValidDeviceKey(wert)).toBe(false)
    }
  })
})

describe('recognitionRecord', () => {
  it('haelt Zeitpunkt und Wortlaut fest', () => {
    const jetzt = new Date('2026-09-01T12:00:00.000Z')
    const r = recognitionRecord(jetzt)

    expect(r.recognitionConsentAt).toBe(jetzt)
    expect(r.recognitionConsentText).toContain(RECOGNITION_TEXT)
    expect(r.recognitionConsentText).toMatch(new RegExp(`^v${RECOGNITION_VERSION}: `))
  })

  it('nennt im Text den Nutzen fuer den Kunden, nicht die Statistik', () => {
    // Eine Einwilligung, die nur dem Betrieb nuetzt, kreuzt niemand an — und sie waere
    // auch schwerer zu rechtfertigen.
    expect(RECOGNITION_TEXT.toLowerCase()).toContain('bestehende karte')
  })
})
