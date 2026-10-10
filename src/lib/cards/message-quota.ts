import type { MessageSegment } from './message-segments'

/**
 * Wie oft ein Betrieb seine Karteninhaber anschreiben darf.
 *
 * Die Grenze schützt den Endkunden, nicht den Server: Eine Stempelkarte, die jede Woche
 * meldet, fliegt aus dem Wallet. Erlaubt sind deshalb zwei Wege nebeneinander:
 *
 *  - **eine selbst verschickte Nachricht je Karte und Kalendermonat** — die spontane
 *    Ankündigung, die jemand im Laden tippt;
 *  - **eine monatliche Nachricht**, die einmal eingerichtet wird und von selbst läuft
 *    (`CardMonthlyMessage`, höchstens eine aktive je Karte).
 *
 * Zwei getrennte Kontingente, damit der Automatismus die spontane Nachricht nicht
 * auffrisst — und umgekehrt.
 */

export const MONTHLY_IMMEDIATE_LIMIT = 1
/** Je Karte eine aktive Monatsnachricht. „Zweimal im Monat" soll keine Einstellung sein. */
export const MONTHLY_RECURRING_LIMIT = 1

/** Woher eine verschickte Nachricht stammt. */
export type MessageOrigin = 'MANUAL' | 'MONTHLY'

/**
 * Hat der Betrieb diese Nachricht selbst geschrieben oder der Monatslauf sie erzeugt?
 *
 * Steht als Fremdschlüssel in der Zeile und wird nicht aus Zeitstempeln erraten: Der
 * Monatslauf setzt `monthlyMessageId`, sonst niemand.
 */
export function classifyMessage(message: { monthlyMessageId: string | null }): MessageOrigin {
  return message.monthlyMessageId ? 'MONTHLY' : 'MANUAL'
}

/** Anfang und Ende des Kalendermonats, in den dieser Zeitpunkt fällt. */
export function monthRange(when: Date): { start: Date; end: Date } {
  const start = new Date(when.getFullYear(), when.getMonth(), 1)
  const end = new Date(when.getFullYear(), when.getMonth() + 1, 1)
  return { start, end }
}

/**
 * Wie viele selbst verschickte Nachrichten in diesem Monat schon draußen sind.
 *
 * Nachrichten aus dem Dashboard zählen mit: Für den Kunden am anderen Ende macht es keinen
 * Unterschied, von welchem Bildschirm aus jemand ihn angeschrieben hat.
 */
export function countManual(messages: Array<{ monthlyMessageId: string | null }>): number {
  let manual = 0
  for (const m of messages) if (classifyMessage(m) === 'MANUAL') manual++
  return manual
}

/** Wie viele selbst verschickte Nachrichten diesen Monat noch gehen. */
export function remainingManual(usedThisMonth: number): number {
  return Math.max(0, MONTHLY_IMMEDIATE_LIMIT - usedThisMonth)
}

/** Was die Oberfläche anzeigt, wenn das Kontingent aufgebraucht ist. */
export const QUOTA_MESSAGE_IMMEDIATE =
  'Diesen Monat wurde bereits eine Nachricht verschickt. Pro Monat ist eine selbst verschickte Nachricht je Karte möglich.'

export const QUOTA_MESSAGE_MONTHLY =
  'Für diese Karte läuft bereits eine monatliche Nachricht. Bitte zuerst die bestehende löschen.'

/** Die Gruppe, an die die PWA verschickt — sie bietet keine Auswahl an. */
export const PWA_DEFAULT_SEGMENT: MessageSegment = 'ALL'
