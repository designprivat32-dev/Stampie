/**
 * Ab wann ein Kunde als inaktiv gilt.
 *
 * Die Frage stellt sich an zwei Stellen im System, und es ist dieselbe: die Erinnerung
 * schreibt „wer seit X nicht da war", die Statistik zählt „wie viele waren seit X nicht
 * da". Zwei Zahlen dafür würden auseinanderlaufen, und die zweite wäre geraten.
 *
 * Deshalb keine eigene Einstellung. Hat der Betrieb eine Erinnerung eingerichtet, hat er
 * seine Schwelle damit schon benannt — die gilt. Hat er keine, greift eine Vorgabe.
 *
 * Die Vorgabe ist bewusst nicht knapp: bei einem Friseurbesuch alle vier bis acht Wochen
 * wäre ein Stammkunde nach zwei Monaten bereits „inaktiv", obwohl er nur eine Runde
 * ausgelassen hat. Drei Monate sind rund zwei ausgelassene Zyklen — lang genug, dass die
 * Zahl etwas bedeutet, kurz genug, dass sie noch handlungsrelevant ist.
 *
 * Pur, damit sich die Regel prüfen lässt, ohne eine Datenbank anzufassen.
 */

export const DEFAULT_INACTIVE_AFTER_DAYS = 90

const MINUTES_PER_DAY = 24 * 60

export interface InactivityThreshold {
  days: number
  /** Woher die Zahl stammt — die Oberfläche kann sie damit unterschiedlich beschriften. */
  source: 'reminder' | 'default'
}

/**
 * Die Schwelle für einen Betrieb.
 *
 * Bei mehreren Erinnerungen gewinnt die kürzeste: sie ist die strengste Auffassung des
 * Betriebs davon, wann jemand zu lange weg ist, und eine Statistik soll nicht später
 * Alarm schlagen als die Erinnerung, die längst geschrieben hat.
 */
export function inactivityThreshold(
  reminderIntervalMinutes: readonly number[],
): InactivityThreshold {
  const days = reminderIntervalMinutes
    .filter((m) => Number.isFinite(m) && m > 0)
    .map((m) => Math.max(1, Math.round(m / MINUTES_PER_DAY)))

  if (days.length === 0) return { days: DEFAULT_INACTIVE_AFTER_DAYS, source: 'default' }
  return { days: Math.min(...days), source: 'reminder' }
}

/** Der Zeitpunkt, vor dem ein Besuch als „zu lange her" gilt. */
export function inactivityCutoff(threshold: InactivityThreshold, now: Date): Date {
  return new Date(now.getTime() - threshold.days * MINUTES_PER_DAY * 60 * 1000)
}
