import { describe, expect, it } from 'vitest'

/**
 * Die Einwilligung in Werbenachrichten.
 *
 * Der teure Fehler wäre nicht, jemanden zu vergessen — es wäre, ohne Häkchen zu senden.
 * Deshalb prüft dieser Test vor allem die Abweisung: was nicht genau „1" ist, ist keine
 * Zustimmung, und wer nicht eingewilligt hat, taucht in keiner Empfängerabfrage auf.
 */

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
