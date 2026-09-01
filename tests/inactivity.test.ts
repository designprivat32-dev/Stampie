import { describe, expect, it } from 'vitest'
import {
  DEFAULT_INACTIVE_AFTER_DAYS,
  inactivityCutoff,
  inactivityThreshold,
} from '@/lib/cards/inactivity'

/**
 * Ab wann jemand als inaktiv gilt.
 *
 * Die Zahl entscheidet, ob ein Betrieb seine Stammkundschaft für abgewandert hält. Zu
 * knapp gewählt, sieht ein Friseur mit ganz normalem Sechs-Wochen-Rhythmus lauter
 * verlorene Kunden — das war der Grund, die Vorgabe nicht bei zwei Monaten zu lassen.
 */
describe('inactivityThreshold', () => {
  it('nimmt die Vorgabe, wenn der Betrieb keine Erinnerung eingerichtet hat', () => {
    expect(inactivityThreshold([])).toEqual({
      days: DEFAULT_INACTIVE_AFTER_DAYS,
      source: 'default',
    })
  })

  it('die Vorgabe liegt über einem üblichen Friseur-Rhythmus', () => {
    // Alle vier bis acht Wochen ist normal; wer danach als inaktiv gilt, ist keiner.
    expect(DEFAULT_INACTIVE_AFTER_DAYS).toBeGreaterThan(8 * 7)
  })

  it('übernimmt die Schwelle der Erinnerung, wenn es eine gibt', () => {
    // 30 Tage in Minuten.
    expect(inactivityThreshold([30 * 24 * 60])).toEqual({ days: 30, source: 'reminder' })
  })

  it('nimmt bei mehreren Erinnerungen die kürzeste', () => {
    const minuten = [60 * 24 * 60, 14 * 24 * 60, 30 * 24 * 60]
    // Sonst schlüge die Statistik später Alarm als die Erinnerung, die längst schreibt.
    expect(inactivityThreshold(minuten).days).toBe(14)
  })

  it('rundet auf volle Tage und nie auf null', () => {
    // Eine Test-Erinnerung mit fünf Minuten darf die Statistik nicht auf 0 Tage setzen.
    expect(inactivityThreshold([5]).days).toBe(1)
    expect(inactivityThreshold([36 * 60]).days).toBe(2) // 1,5 Tage
  })

  it('ignoriert unbrauchbare Werte statt an ihnen zu scheitern', () => {
    expect(inactivityThreshold([0, -10, Number.NaN]).source).toBe('default')
    expect(inactivityThreshold([Number.NaN, 30 * 24 * 60]).days).toBe(30)
  })
})

describe('inactivityCutoff', () => {
  it('rechnet die Schwelle rückwärts vom Stichtag', () => {
    const jetzt = new Date('2026-09-01T12:00:00.000Z')
    const cutoff = inactivityCutoff({ days: 90, source: 'default' }, jetzt)

    expect(cutoff.toISOString()).toBe('2026-06-03T12:00:00.000Z')
    expect(cutoff.getTime()).toBeLessThan(jetzt.getTime())
  })

  it('trifft über Monatsgrenzen hinweg denselben Tag', () => {
    // Die frühere Fassung rechnete mit setMonth() — das springt bei einem 31. auf den
    // Folgemonat und verschiebt die Grenze um bis zu drei Tage.
    const cutoff = inactivityCutoff({ days: 30, source: 'default' }, new Date('2026-03-31T00:00:00Z'))
    expect(cutoff.toISOString().slice(0, 10)).toBe('2026-03-01')
  })
})
