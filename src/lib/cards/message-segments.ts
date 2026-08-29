/**
 * Wer eine Nachricht bekommt.
 *
 * Das System kennt keine Personen — eine ausgegebene Karte hat keinen Namen, keine
 * E-Mail, keine Nummer, das ist Absicht. Ansprechbar ist deshalb nicht "Frau Meier",
 * sondern "wem noch ein Stempel fehlt". Genau das sind diese Gruppen.
 *
 * Gerechnet wird gegen `stampGoal` des Passes, nicht gegen das des Designs: eine
 * ausgegebene Karte behält ihr Ziel, auch wenn das Design später auf zwölf Stempel
 * umgestellt wird. Sonst bekäme "noch ein Stempel" die Falschen.
 *
 * Bewusst ohne Serverabhängigkeiten, damit die Regel an einer Stelle steht und geprüft
 * werden kann, ohne eine Datenbank hochzufahren.
 */

export const MESSAGE_SEGMENTS = ['ALL', 'MISSING_1', 'MISSING_2', 'MISSING_3', 'EMPTY'] as const
export type MessageSegment = (typeof MESSAGE_SEGMENTS)[number]

export const MESSAGE_SEGMENT_LABELS: Record<MessageSegment, string> = {
  ALL: 'Alle Karteninhaber',
  MISSING_1: 'Noch 1 Stempel bis zur Belohnung',
  MISSING_2: 'Noch 2 Stempel',
  MISSING_3: 'Noch 3 Stempel',
  EMPTY: 'Noch kein einziger Stempel',
}

/** Nur das, wonach gefiltert wird — absichtlich kein ganzer Pass. */
export interface SegmentablePass {
  stamps: number
  /** Das Ziel, mit dem dieser Pass ausgegeben wurde. */
  stampGoal: number
}

export function isMessageSegment(value: unknown): value is MessageSegment {
  return typeof value === 'string' && (MESSAGE_SEGMENTS as readonly string[]).includes(value)
}

/**
 * Eine Zeile aus der Datenbank kann eine Gruppe tragen, die es nicht mehr gibt — etwa nach
 * einer Umbenennung. Sie darf dann nicht den Versandlauf sprengen, sondern fällt auf "alle"
 * zurück; das ist das Verhalten, das die Nachricht vor dieser Funktion hatte.
 */
export function parseMessageSegment(value: unknown): MessageSegment {
  return isMessageSegment(value) ? value : 'ALL'
}

/**
 * Wie viele Stempel dem Pass noch bis zur Belohnung fehlen.
 *
 * Nie negativ: eine volle Karte, die noch nicht eingelöst wurde, steht bei 0 — sie fehlt
 * niemandem mehr, sie wartet.
 */
export function remainingStamps(pass: SegmentablePass): number {
  return Math.max(0, pass.stampGoal - pass.stamps)
}

export function matchesSegment(pass: SegmentablePass, segment: MessageSegment): boolean {
  switch (segment) {
    case 'ALL':
      return true
    case 'EMPTY':
      return pass.stamps <= 0
    case 'MISSING_1':
      return remainingStamps(pass) === 1
    case 'MISSING_2':
      return remainingStamps(pass) === 2
    case 'MISSING_3':
      return remainingStamps(pass) === 3
  }
}

/**
 * Alle Gruppen außer "alle" zählen Stempel — auf einem Gutschein gibt es keine. Ein
 * Gutschein-Pass würde bei 0 Stempeln sonst in "noch kein einziger Stempel" landen und
 * eine Nachricht über etwas bekommen, das seine Karte nicht kann.
 */
export function segmentAppliesToStampCardsOnly(segment: MessageSegment): boolean {
  return segment !== 'ALL'
}
