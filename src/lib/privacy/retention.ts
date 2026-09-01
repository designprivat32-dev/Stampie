import 'server-only'
import { prisma } from '@/lib/db'

/**
 * Aufbewahrung: was nach welcher Frist verschwindet.
 *
 * Bis hierher hat das System nie etwas gelöscht. Art. 5 Abs. 1 lit. e verlangt aber eine
 * Frist, und die heikelste Datenart ist nicht der Stempelstand, sondern die Historie der
 * einzelnen Besuche — daraus liest man ab, wie oft und in welchem Rhythmus jemand kommt.
 *
 * Der entscheidende Punkt: **der Stempelstand liegt auf `IssuedPass`, nicht in den
 * Ereignissen.** Alte `StampEvent`-Zeilen zu löschen kostet also keinen einzigen Stempel.
 * Es geht nur die Frage verloren, *wann* die Stempel gebucht wurden — und die braucht
 * niemand mehr, wenn sie über ein Jahr zurückliegt.
 *
 * Ausgegebene Karten (`IssuedPass`) räumt dieser Lauf bewusst **nicht** ab. Eine Karte zu
 * löschen, die noch im Wallet eines Kunden liegt, macht sie dort kaputt — das ist eine
 * Entscheidung für den Betrieb, nicht für einen nächtlichen Cron. Einzelne Karten löscht
 * man über die Auskunfts- und Löschfunktion im Dashboard.
 */

export interface RetentionPolicy {
  /** Historie der einzelnen Stempelbuchungen. */
  stampEventDays: number
  /** Nachweis, wer wann eine Erinnerung bekommen hat. */
  reminderDeliveryDays: number
  /** Bereits versendete Nachrichten. */
  sentMessageDays: number
  /** Testkarten-Token, gerechnet ab ihrem Ablauf. */
  expiredTokenDays: number
}

export const DEFAULT_RETENTION: RetentionPolicy = {
  stampEventDays: 400,
  reminderDeliveryDays: 400,
  sentMessageDays: 400,
  expiredTokenDays: 30,
}

const ENV_KEYS: Record<keyof RetentionPolicy, string> = {
  stampEventDays: 'RETENTION_STAMP_EVENT_DAYS',
  reminderDeliveryDays: 'RETENTION_REMINDER_DELIVERY_DAYS',
  sentMessageDays: 'RETENTION_SENT_MESSAGE_DAYS',
  expiredTokenDays: 'RETENTION_EXPIRED_TOKEN_DAYS',
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Fristen aus der Umgebung, mit den Vorgaben als Rückfall.
 *
 * Unsinnige Werte werden verworfen statt übernommen: eine vertippte 0 würde sonst beim
 * nächsten Lauf die gesamte Historie löschen. Untergrenze ist ein Tag.
 */
export function readRetentionPolicy(
  env: Record<string, string | undefined> = process.env,
): RetentionPolicy {
  const out = { ...DEFAULT_RETENTION }
  for (const key of Object.keys(ENV_KEYS) as (keyof RetentionPolicy)[]) {
    const raw = env[ENV_KEYS[key]]?.trim()
    if (!raw) continue
    const value = Number(raw)
    if (Number.isInteger(value) && value >= 1) out[key] = value
  }
  return out
}

export interface Cutoffs {
  stampEvents: Date
  reminderDeliveries: Date
  sentMessages: Date
  expiredTokens: Date
}

/** Pur, damit sich die Rechnung prüfen lässt, ohne eine Datenbank anzufassen. */
export function cutoffsFor(policy: RetentionPolicy, now: Date): Cutoffs {
  const back = (days: number) => new Date(now.getTime() - days * DAY_MS)
  return {
    stampEvents: back(policy.stampEventDays),
    reminderDeliveries: back(policy.reminderDeliveryDays),
    sentMessages: back(policy.sentMessageDays),
    expiredTokens: back(policy.expiredTokenDays),
  }
}

export interface RetentionResult {
  stampEvents: number
  reminderDeliveries: number
  sentMessages: number
  expiredTokens: number
  expiredSessions: number
}

/** Räumt auf. Läuft im täglichen Cron mit; siehe `api/cron/messages`. */
export async function runRetention(now: Date = new Date()): Promise<RetentionResult> {
  const policy = readRetentionPolicy()
  const cut = cutoffsFor(policy, now)

  const [stampEvents, reminderDeliveries, sentMessages, expiredTokens, expiredSessions] =
    await Promise.all([
      prisma.stampEvent.deleteMany({ where: { createdAt: { lt: cut.stampEvents } } }),
      prisma.cardReminderDelivery.deleteMany({ where: { sentAt: { lt: cut.reminderDeliveries } } }),
      // Nur Versendetes: geplante Nachrichten haben ihren Zweck noch vor sich.
      prisma.cardMessage.deleteMany({ where: { sentAt: { lt: cut.sentMessages } } }),
      prisma.testCardToken.deleteMany({ where: { expiresAt: { lt: cut.expiredTokens } } }),
      // Abgelaufene Sitzungen haben keine Frist — sie sind ab dem Ablauf wertlos.
      prisma.appSession.deleteMany({ where: { expiresAt: { lt: now } } }),
    ])

  return {
    stampEvents: stampEvents.count,
    reminderDeliveries: reminderDeliveries.count,
    sentMessages: sentMessages.count,
    expiredTokens: expiredTokens.count,
    expiredSessions: expiredSessions.count,
  }
}
