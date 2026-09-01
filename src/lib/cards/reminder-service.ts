import 'server-only'
import type { CardKind } from '@/lib/cards/schema'
import { prisma } from '@/lib/db'
import { pushAppleWalletUpdateForPasses } from '@/lib/wallet/apple-sync'
import { sendGoogleWalletMessageToPasses } from '@/lib/wallet/google-sync'

/**
 * Inaktivitäts-Erinnerungen — pro Kunde.
 *
 * Für jede aktive `CardReminder` (Schwelle in Minuten) sucht der Lauf die Kunden dieser
 * Karte, die seit der Schwelle nicht mehr da waren (kein Stempel) und die in diesem
 * Fenster noch nicht erinnert wurden. Nur an die geht die Nachricht. Danach wieder erst
 * nach der nächsten Schwelle — und ein neuer Besuch setzt den Zähler von selbst zurück,
 * weil „zuletzt da" dann jünger ist als die Schwelle.
 *
 * „Zuletzt da" kommt aus `StampEvent` — der Stempel-Code bleibt unangetastet. Der Versand
 * nutzt den Einzel-Pass-Weg der Gruppen-Nachrichten: Text aufs Pass-Feld schreiben, dann
 * Apple/Google an genau diese Pässe.
 */

const MINUTE_MS = 60 * 1000

/** Unsichtbares Zeichen (Zero-Width Space): erzwingt bei Apple eine Feldänderung. */
const ZWSP = '​'

export interface ReminderRunResult {
  reminders: number
  sent: number
  errors: number
}

interface ReminderRow {
  id: string
  cardId: string
  headline: string | null
  body: string
  intervalMinutes: number
  card: { kind: CardKind }
}

export async function deliverDueReminders(now: Date = new Date()): Promise<ReminderRunResult> {
  const reminders = await prisma.cardReminder.findMany({
    where: { enabled: true },
    select: {
      id: true,
      cardId: true,
      headline: true,
      body: true,
      intervalMinutes: true,
      card: { select: { kind: true } },
    },
  })

  let sent = 0
  let errors = 0
  for (const reminder of reminders) {
    try {
      sent += await deliverReminderToDueCustomers(reminder, now)
    } catch {
      errors++
    }
  }
  return { reminders: reminders.length, sent, errors }
}

async function deliverReminderToDueCustomers(reminder: ReminderRow, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - reminder.intervalMinutes * MINUTE_MS)

  // Echte Kunden-Pässe dieser Karte — Testkarten bleiben außen vor.
  const passes = await prisma.issuedPass.findMany({
    // Eine Erinnerung ist Werbung, kein Dienst am Pass: ohne Einwilligung geht sie nicht
    // raus. Fehlt sie, ist `marketingConsentAt` null.
    where: {
      cardId: reminder.cardId,
      isTest: false,
      kind: 'STAMP',
      marketingConsentAt: { not: null },
    },
    select: { id: true, serial: true, createdAt: true },
  })
  if (passes.length === 0) return 0
  const passIds = passes.map((p) => p.id)

  // Letzter Besuch je Pass = jüngstes STAMP-Event. Fehlt eins, gilt die Ausgabe (createdAt).
  const lastEvents = await prisma.stampEvent.groupBy({
    by: ['passId'],
    where: { passId: { in: passIds }, kind: 'STAMP' },
    _max: { createdAt: true },
  })
  const lastVisit = new Map<string, Date>()
  for (const e of lastEvents) {
    if (e._max.createdAt) lastVisit.set(e.passId, e._max.createdAt)
  }

  // Letzte Erinnerung + bisheriger Zähler je Pass, für GENAU diese Erinnerung.
  const deliveries = await prisma.cardReminderDelivery.findMany({
    where: { reminderId: reminder.id, passId: { in: passIds } },
    select: { passId: true, sentAt: true, count: true },
  })
  const lastReminder = new Map<string, Date>()
  const priorCount = new Map<string, number>()
  for (const d of deliveries) {
    lastReminder.set(d.passId, d.sentAt)
    priorCount.set(d.passId, d.count)
  }

  // Ziel: lange genug weg UND nicht erst in diesem Fenster erinnert.
  const targets = passes.filter((p) => {
    const visited = lastVisit.get(p.id) ?? p.createdAt
    if (visited > cutoff) return false
    const reminded = lastReminder.get(p.id)
    if (reminded && reminded > cutoff) return false
    return true
  })
  if (targets.length === 0) return 0

  // Pro Pass: Text (mit wachsender unsichtbarer Variation) aufs Pass-Feld schreiben und den
  // Erinnerungs-Datensatz hochzählen — alles in einer Transaktion.
  const ops = targets.flatMap((t) => {
    const n = ((priorCount.get(t.id) ?? 0) % 6) + 1
    return [
      prisma.issuedPass.update({
        where: { id: t.id },
        data: { activeMessage: reminder.body + ZWSP.repeat(n), activeMessageAt: now },
      }),
      prisma.cardReminderDelivery.upsert({
        where: { reminderId_passId: { reminderId: reminder.id, passId: t.id } },
        update: { sentAt: now, count: { increment: 1 } },
        create: { reminderId: reminder.id, passId: t.id, sentAt: now, count: 1 },
      }),
    ]
  })
  await prisma.$transaction(ops)

  // Nur bei genau diesen Pässen anklopfen (Apple) bzw. Nachricht senden (Google).
  const serials = targets.map((t) => t.serial)
  try {
    await pushAppleWalletUpdateForPasses(serials)
  } catch {
    /* best effort */
  }
  try {
    await sendGoogleWalletMessageToPasses(
      serials,
      { headline: reminder.headline, body: reminder.body },
      reminder.card.kind,
    )
  } catch {
    /* best effort */
  }

  await prisma.cardReminder.update({
    where: { id: reminder.id },
    data: { lastSentAt: now, sentCount: { increment: targets.length } },
  })

  return targets.length
}
