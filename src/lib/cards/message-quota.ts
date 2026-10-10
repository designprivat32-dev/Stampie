import type { MessageSegment } from './message-segments'

/**
 * Wie viele Nachrichten ein Betrieb je Karte und Monat verschicken darf.
 *
 * Die Grenze schützt den Endkunden, nicht den Server: Eine Stempelkarte, die jede Woche
 * meldet, fliegt aus dem Wallet. Erlaubt ist deshalb **eine sofortige und eine geplante
 * Nachricht je Karte und Kalendermonat** — zwei Kontingente nebeneinander, damit eine
 * spontane Ankündigung die geplante Monatsnachricht nicht auffrisst und umgekehrt.
 *
 * Die wiederkehrende Inaktivitäts-Erinnerung (`CardReminder`) zählt bewusst nicht mit:
 * Sie geht nicht an alle, sondern nur an den Einzelnen, der weggeblieben ist, und sie
 * hört auf, sobald er wiederkommt.
 */

export const MONTHLY_IMMEDIATE_LIMIT = 1
export const MONTHLY_SCHEDULED_LIMIT = 1

export type MessageKind = 'IMMEDIATE' | 'SCHEDULED'

/**
 * Zeitpuffer, in dem „geplant für jetzt" noch als sofort gilt.
 *
 * Eine sofortige Nachricht bekommt ihr `scheduledFor` aus der Uhr der Anwendung, ihr
 * `createdAt` aus der Uhr der Datenbank. Das sind zwei Maschinen; ein paar Millisekunden
 * Versatz sind normal, und ohne Puffer würde ein minimal vorgehender Anwendungsserver
 * eine sofortige Nachricht als geplant einstufen. Echte Planungen liegen Stunden oder
 * Tage in der Zukunft — zwei Minuten trennen die beiden Fälle zuverlässig.
 */
const CLOCK_SKEW_MS = 2 * 60 * 1000

/** Frühestens so weit in der Zukunft darf eine geplante Nachricht liegen. */
export const MIN_SCHEDULE_AHEAD_MS = 5 * 60 * 1000
/** Und höchstens so weit — alles darüber ist ein Vertipper im Jahr. */
export const MAX_SCHEDULE_AHEAD_MS = 366 * 24 * 60 * 60 * 1000

/**
 * War diese Nachricht eine sofortige oder eine geplante?
 *
 * Steht nicht in der Datenbank, sondern ergibt sich aus den beiden Zeitstempeln: Wer
 * sofort sendet, setzt `scheduledFor` auf das Jetzt und liegt damit nie nennenswert hinter
 * `createdAt`. Das spart eine Spalte, die nur wiederholt hätte, was ohnehin dasteht.
 */
export function classifyMessage(message: { scheduledFor: Date; createdAt: Date }): MessageKind {
  return message.scheduledFor.getTime() > message.createdAt.getTime() + CLOCK_SKEW_MS
    ? 'SCHEDULED'
    : 'IMMEDIATE'
}

/** Anfang und Ende des Kalendermonats, in den dieser Zeitpunkt fällt. */
export function monthRange(when: Date): { start: Date; end: Date } {
  const start = new Date(when.getFullYear(), when.getMonth(), 1)
  const end = new Date(when.getFullYear(), when.getMonth() + 1, 1)
  return { start, end }
}

export interface MonthlyUsage {
  immediate: number
  scheduled: number
}

/** Zählt die Nachrichten eines Monats nach Art. */
export function countUsage(
  messages: Array<{ scheduledFor: Date; createdAt: Date }>,
): MonthlyUsage {
  let immediate = 0
  let scheduled = 0
  for (const m of messages) {
    if (classifyMessage(m) === 'SCHEDULED') scheduled++
    else immediate++
  }
  return { immediate, scheduled }
}

/**
 * Darf diese Art Nachricht in diesem Monat noch raus?
 *
 * Gezählt wird nach dem Monat, in dem die Nachricht **ankommt**, nicht nach dem, in dem
 * sie angelegt wurde. Sonst ließen sich im Oktober zwölf Nachrichten für Dezember
 * einstellen und die Grenze wäre eine Formalie.
 */
export function remaining(usage: MonthlyUsage, kind: MessageKind): number {
  return kind === 'SCHEDULED'
    ? Math.max(0, MONTHLY_SCHEDULED_LIMIT - usage.scheduled)
    : Math.max(0, MONTHLY_IMMEDIATE_LIMIT - usage.immediate)
}

/** Was die Oberfläche anzeigt, wenn das Kontingent aufgebraucht ist. */
export function quotaMessage(kind: MessageKind): string {
  return kind === 'SCHEDULED'
    ? 'Für diesen Monat ist bereits eine Nachricht geplant. Pro Monat ist eine geplante Nachricht je Karte möglich.'
    : 'Diesen Monat wurde bereits eine Nachricht sofort verschickt. Pro Monat ist eine sofortige Nachricht je Karte möglich.'
}

/** Die Gruppe, an die die PWA verschickt — sie bietet keine Auswahl an. */
export const PWA_DEFAULT_SEGMENT: MessageSegment = 'ALL'
