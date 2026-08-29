import { describe, expect, it } from 'vitest'
import {
  MESSAGE_SEGMENTS,
  MESSAGE_SEGMENT_LABELS,
  matchesSegment,
  parseMessageSegment,
  remainingStamps,
} from '@/lib/cards/message-segments'

/**
 * Die Regel, nach der eine Nachricht ihre Empfänger findet.
 *
 * Sie steht hier ohne Datenbank, weil ein Fehler darin lautlos ist: die Nachricht geht
 * raus, sie erreicht Leute, nur eben die falschen — und das merkt niemand, weil auf der
 * anderen Seite kein Name steht, an dem es auffiele.
 */

const p = (stamps: number, stampGoal = 10) => ({ stamps, stampGoal })

describe('remainingStamps', () => {
  it('zählt bis zum Ziel des Passes', () => {
    expect(remainingStamps(p(8))).toBe(2)
    expect(remainingStamps(p(8, 12))).toBe(4)
  })

  it('wird bei einer vollen Karte nicht negativ', () => {
    // Eine volle Karte wartet auf die Belohnung, ihr fehlt nichts mehr.
    expect(remainingStamps(p(10))).toBe(0)
    expect(remainingStamps(p(14))).toBe(0)
  })
})

describe('matchesSegment', () => {
  it('trennt die Stufen sauber voneinander', () => {
    expect(matchesSegment(p(9), 'MISSING_1')).toBe(true)
    expect(matchesSegment(p(9), 'MISSING_2')).toBe(false)
    expect(matchesSegment(p(8), 'MISSING_2')).toBe(true)
    expect(matchesSegment(p(7), 'MISSING_3')).toBe(true)
  })

  it('lässt die volle Karte in keiner „noch"-Gruppe landen', () => {
    for (const segment of ['MISSING_1', 'MISSING_2', 'MISSING_3'] as const) {
      expect(matchesSegment(p(10), segment)).toBe(false)
    }
  })

  it('erkennt die leere Karte, egal wie hoch das Ziel steht', () => {
    expect(matchesSegment(p(0), 'EMPTY')).toBe(true)
    expect(matchesSegment(p(0, 20), 'EMPTY')).toBe(true)
    expect(matchesSegment(p(1), 'EMPTY')).toBe(false)
  })

  it('nimmt bei „alle" jede Karte mit', () => {
    for (const pass of [p(0), p(5), p(10), p(99)]) {
      expect(matchesSegment(pass, 'ALL')).toBe(true)
    }
  })
})

describe('parseMessageSegment', () => {
  it('fällt bei einer unbekannten Gruppe auf „alle" zurück', () => {
    // Eine alte Zeile darf den Versandlauf nicht sprengen.
    expect(parseMessageSegment('GAB_ES_MAL')).toBe('ALL')
    expect(parseMessageSegment(null)).toBe('ALL')
  })

  it('lässt bekannte Gruppen unangetastet', () => {
    for (const segment of MESSAGE_SEGMENTS) {
      expect(parseMessageSegment(segment)).toBe(segment)
    }
  })
})

describe('MESSAGE_SEGMENT_LABELS', () => {
  it('benennt jede Gruppe — eine namenlose stünde leer im Auswahlfeld', () => {
    for (const segment of MESSAGE_SEGMENTS) {
      expect(MESSAGE_SEGMENT_LABELS[segment].length).toBeGreaterThan(0)
    }
  })
})
