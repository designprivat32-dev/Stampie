import 'server-only'
import { prisma } from '@/lib/db'
import { deliverCardMessage } from './message-service'
import { PWA_DEFAULT_SEGMENT } from './message-quota'

/**
 * Die monatliche Nachricht an alle Karteninhaber.
 *
 * Einmal eingerichtet, läuft sie von selbst: Der Versandlauf nimmt jede fällige Zeile,
 * legt daraus eine ganz normale `CardMessage` an und schickt sie über denselben Weg wie
 * eine von Hand geschriebene. Dadurch erscheint sie in derselben Liste, zählt dieselben
 * Empfänger und meldet Fehler auf dieselbe Weise — es gibt keinen zweiten Versandpfad,
 * der getrennt gepflegt und getrennt kaputtgehen könnte.
 *
 * Die erzeugte Zeile trägt `monthlyMessageId`. Daran erkennt die Kontingent-Rechnung, dass
 * sie nicht vom Betrieb stammt: Sonst fräße der Automatismus jeden Monat die eine
 * spontane Nachricht auf, die dem Betrieb zusteht.
 */

/** Mehr Tage gibt es nicht in jedem Monat — siehe `CardMonthlyMessage.dayOfMonth`. */
export const MAX_DAY_OF_MONTH = 28

export interface MonthlyRunResult {
  due: number
  sent: number
  errors: number
}

/**
 * Wann diese Monatsnachricht das nächste Mal fällig ist.
 *
 * Immer der nächste Termin **nach** dem Stichtag, nie der heutige: Wer die Nachricht am
 * Dritten einrichtet und den Dritten wählt, soll sie nicht eine Stunde später an alle
 * Kunden verschickt haben, ohne es gewollt zu haben.
 */
export function nextMonthlyDue(dayOfMonth: number, after: Date = new Date()): Date {
  const day = Math.min(Math.max(1, Math.round(dayOfMonth)), MAX_DAY_OF_MONTH)
  const candidate = new Date(after.getFullYear(), after.getMonth(), day)
  if (candidate.getTime() > after.getTime()) return candidate
  return new Date(after.getFullYear(), after.getMonth() + 1, day)
}

/**
 * Verschickt jede fällige Monatsnachricht und legt den nächsten Termin fest.
 *
 * Der nächste Termin wird aus dem Jetzt gerechnet und nicht aus dem alten `nextSendAt`:
 * Lag der Lauf einmal still — kein Ping, Wartung, abgelaufenes Geheimnis —, liefe sonst
 * jeder verpasste Monat nacheinander nach, und der Kunde bekäme drei Nachrichten
 * hintereinander für drei Monate, in denen er nichts gehört hat.
 */
export async function deliverDueMonthlyMessages(now: Date = new Date()): Promise<MonthlyRunResult> {
  const due = await prisma.cardMonthlyMessage.findMany({
    where: { enabled: true, nextSendAt: { lte: now } },
    select: { id: true, cardId: true, headline: true, body: true, dayOfMonth: true, createdBy: true },
  })

  let sent = 0
  let errors = 0

  for (const monthly of due) {
    try {
      const message = await prisma.cardMessage.create({
        data: {
          cardId: monthly.cardId,
          headline: monthly.headline,
          body: monthly.body,
          segment: PWA_DEFAULT_SEGMENT,
          scheduledFor: now,
          createdBy: monthly.createdBy,
          monthlyMessageId: monthly.id,
        },
        select: { id: true },
      })

      await deliverCardMessage(message.id)

      /*
       * Der Termin wird auch nach einem Fehlschlag weitergestellt.
       *
       * Ein Pass, der nicht erreichbar war, ist kein Grund, es beim nächsten Lauf in zehn
       * Minuten erneut zu versuchen — daraus würde eine Schleife, die denselben Text
       * stündlich zustellt. Was schiefging, steht in der erzeugten `CardMessage`.
       */
      sent++
    } catch {
      errors++
    } finally {
      await prisma.cardMonthlyMessage.update({
        where: { id: monthly.id },
        data: { lastSentAt: now, nextSendAt: nextMonthlyDue(monthly.dayOfMonth, now) },
      })
    }
  }

  return { due: due.length, sent, errors }
}
