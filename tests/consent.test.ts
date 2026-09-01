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
