import 'server-only'
import { prisma } from '@/lib/db'
import { pushAppleWalletUpdateForCard } from '@/lib/wallet/apple-sync'
import { sendGoogleWalletMessage } from '@/lib/wallet/google-sync'

/**
 * Wiederkehrende Karten-Erinnerungen.
 *
 * Anders als `CardMessage` (Einmal-Versand) bleibt eine `CardReminder` stehen und feuert
 * alle `intervalDays` Tage erneut an alle Kunden, die die Karte im Wallet haben. Der
 * tägliche Cron-Lauf ruft `deliverDueReminders()`.
 *
 * Der Versand ist derselbe Weg wie bei manuellen Nachrichten: Apple bekommt die Meldung
 * über ein geändertes Feld auf der Karte, Google über eine `TEXT_AND_NOTIFY`-Nachricht an
 * die Klasse. Beides „best effort" — ein hängendes Telefon darf den Lauf nicht stoppen.
 */

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Apple zeigt eine Benachrichtigung nur, wenn sich der Feldwert *ändert*. Eine Erinnerung
 * mit jede Runde identischem Text würde ab dem zweiten Mal stumm bleiben. Deshalb hängen
 * wir eine wachsende, unsichtbare Markierung (Zero-Width Space) an den Apple-Text — für
 * den Kunden unsichtbar, für iOS eine echte Änderung.
 */
const ZWSP = '​'
function appleBodyFor(body: string, sentCount: number): string {
  return body + ZWSP.repeat((sentCount % 6) + 1)
}

export interface ReminderRunResult {
  due: number
  sent: number
  errors: number
}

export async function deliverDueReminders(now: Date = new Date()): Promise<ReminderRunResult> {
  const due = await prisma.cardReminder.findMany({
    where: { enabled: true, nextSendAt: { lte: now } },
    select: { id: true },
    take: 500,
  })

  let sent = 0
  let errors = 0
  for (const row of due) {
    const ok = await deliverOneReminder(row.id, now)
    if (ok) sent++
    else errors++
  }
  return { due: due.length, sent, errors }
}

/**
 * Verschickt eine einzelne Erinnerung und stellt ihren Zeitplan weiter.
 *
 * Der Zeitplan wird auch bei Teil-Fehlern weitergestellt: sonst stünde die Erinnerung beim
 * nächsten Lauf sofort wieder als „fällig" da und würde die Kunden mehrfach anpingen.
 */
export async function deliverOneReminder(
  reminderId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const reminder = await prisma.cardReminder.findFirst({
    where: { id: reminderId },
    select: {
      id: true,
      cardId: true,
      headline: true,
      body: true,
      intervalDays: true,
      sentCount: true,
      enabled: true,
      card: { select: { kind: true } },
    },
  })
  if (!reminder || !reminder.enabled) return false

  let hadError = false

  // Apple: Text (mit unsichtbarer Variation) aufs Kartenfeld schreiben und pushen.
  try {
    await prisma.card.update({
      where: { id: reminder.cardId },
      data: {
        activeMessage: appleBodyFor(reminder.body, reminder.sentCount),
        activeMessageAt: now,
      },
    })
    const push = await pushAppleWalletUpdateForCard(reminder.cardId)
    if (push.failed > 0) hadError = true
  } catch {
    hadError = true
  }

  // Google: eine Nachricht an die Klasse erreicht alle Kartenbesitzer.
  try {
    const google = await sendGoogleWalletMessage(
      reminder.cardId,
      { headline: reminder.headline, body: reminder.body },
      reminder.card.kind,
    )
    if (google.status === 'error') hadError = true
  } catch {
    hadError = true
  }

  await prisma.cardReminder.update({
    where: { id: reminder.id },
    data: {
      lastSentAt: now,
      sentCount: { increment: 1 },
      nextSendAt: new Date(now.getTime() + reminder.intervalDays * DAY_MS),
    },
  })

  return !hadError
}
