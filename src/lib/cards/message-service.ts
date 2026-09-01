import 'server-only'
import { prisma } from '@/lib/db'
import { pushAppleWalletUpdateForPasses } from '@/lib/wallet/apple-sync'
import { sendGoogleWalletMessageToPasses } from '@/lib/wallet/google-sync'
import {
  matchesSegment,
  MESSAGE_SEGMENT_LABELS,
  parseMessageSegment,
  type MessageSegment,
} from './message-segments'
import type { CardKind } from './schema'

/**
 * Delivering a shop's message to everyone holding one of its cards.
 *
 * Neither wallet needs a push service of our own, and the two get there differently:
 *
 *   Apple  has no channel for free-form pushes at all. A notification is the side effect
 *          of a *field* changing, so the message is written onto the card and the existing
 *          update push makes every phone come and fetch it.
 *   Google has a real endpoint. One call on the class reaches every holder.
 *
 * Best effort on both sides, and reported separately: a shop that sees "gesendet" while
 * half the wallets got nothing is worse off than one that sees what actually happened.
 */

/** Apple truncates a lock-screen message around here, so nothing longer is accepted. */
export const MESSAGE_MAX_LENGTH = 150

export interface MessageDeliveryResult {
  appleDevices: number
  googleSynced: boolean
  /** Wie viele ausgegebene Karten die Gruppe umfasste — 0 heißt: niemand passte darauf. */
  recipients: number
  error: string | null
}

export async function deliverCardMessage(messageId: string): Promise<MessageDeliveryResult> {
  const message = await prisma.cardMessage.findFirst({
    where: { id: messageId, sentAt: null },
    select: {
      id: true,
      cardId: true,
      headline: true,
      body: true,
      segment: true,
      card: { select: { kind: true } },
    },
  })
  if (!message) {
    return { appleDevices: 0, googleSynced: false, recipients: 0, error: 'Nachricht nicht gefunden.' }
  }

  const segment = parseMessageSegment(message.segment)
  // Auch "an alle" läuft über den Einzel-Pass-Weg. Der frühere Weg schrieb den Text auf
  // die *Karte*, und den erbt jeder Pass — eine Einwilligung, die sich so umgehen lässt,
  // wäre keine.
  const result = await deliverToSegment(message, segment)

  // Written even when something failed: a half-delivered message must not be sent again by
  // the next run, or the shops that did receive it get it twice.
  await prisma.cardMessage.update({
    where: { id: message.id },
    data: {
      sentAt: new Date(),
      appleDevices: result.appleDevices,
      googleSynced: result.googleSynced,
      recipients: result.recipients,
      error: result.error,
    },
  })

  return result
}

interface PendingMessage {
  id: string
  cardId: string
  headline: string | null
  body: string
  card: { kind: CardKind }
}

/**
 * Der Weg für eine Gruppe: die Nachricht hängt am einzelnen Pass.
 *
 * Apple kennt keinen freien Push — eine Meldung entsteht, weil sich ein Feld ändert.
 * Deshalb wird der Text auf genau die betroffenen Pässe geschrieben und auch nur dort
 * angeklopft. Google bekommt die Meldung aufs Objekt statt auf die Klasse, aus demselben
 * Grund.
 */
async function deliverToSegment(
  message: PendingMessage,
  segment: MessageSegment,
): Promise<MessageDeliveryResult> {
  const passes = await prisma.issuedPass.findMany({
    where: {
      cardId: message.cardId,
      // Testkarten bleiben außen vor, wie überall: sie sind Werkzeug, kein Kunde.
      isTest: false,
      // Stempelgruppen zählen Stempel; "alle" schließt Gutscheine mit ein.
      ...(segment === 'ALL' ? {} : { kind: 'STAMP' as const }),
      // Ohne Einwilligung keine Werbenachricht.
      marketingConsentAt: { not: null },
    },
    select: { id: true, serial: true, stamps: true, stampGoal: true, activeMessage: true },
  })
  const targets = passes.filter((pass) => matchesSegment(pass, segment))

  if (targets.length === 0) {
    return {
      appleDevices: 0,
      googleSynced: false,
      recipients: 0,
      error:
        segment === 'ALL'
          ? 'Niemand hat in Nachrichten eingewilligt. Das Häkchen setzen Kunden beim Hinzufügen der Karte.'
          : `Niemand in dieser Gruppe: „${MESSAGE_SEGMENT_LABELS[segment]}" trifft aktuell auf keine ausgegebene Karte mit Einwilligung zu.`,
    }
  }

  const problems: string[] = []
  const body = message.body.trim()

  /*
   * Wieder Apples Regel: gleicher Feldwert, keine Meldung. Was ein Pass gerade zeigt, ist
   * seine eigene Nachricht — und wenn er keine hat, die der Karte.
   */
  const changed = targets.filter((pass) => pass.activeMessage?.trim() !== body)

  let appleDevices = 0
  if (changed.length === 0) {
    problems.push(
      'Apple: identischer Text wie zuletzt — iPhones zeigen dafür keine Meldung. Bitte umformulieren.',
    )
  } else {
    await prisma.issuedPass.updateMany({
      where: { id: { in: changed.map((pass) => pass.id) } },
      data: { activeMessage: message.body, activeMessageAt: new Date() },
    })
    const push = await pushAppleWalletUpdateForPasses(changed.map((pass) => pass.serial))
    appleDevices = push.devices
    if (push.failed > 0) problems.push(`Apple: ${push.failed} Karten nicht erreicht.`)
  }

  const google = await sendGoogleWalletMessageToPasses(
    targets.map((pass) => pass.serial),
    { headline: message.headline, body: message.body },
    message.card.kind,
  )
  if (google.failed > 0) problems.push(`Google: ${google.failed} Karten nicht erreicht.`)

  return {
    appleDevices,
    googleSynced: google.delivered > 0,
    recipients: targets.length,
    error: problems.length > 0 ? problems.join(' ') : null,
  }
}

/**
 * Everything whose time has come. Called by whatever scheduler is wired up — the endpoint
 * is deliberately dumb about who triggers it, because Vercel's own cron cannot run more
 * than once a day on the current plan.
 */
export async function deliverDueMessages(now: Date = new Date()): Promise<{
  delivered: number
  failed: number
}> {
  const due = await prisma.cardMessage.findMany({
    where: { sentAt: null, scheduledFor: { lte: now } },
    orderBy: { scheduledFor: 'asc' },
    // A ceiling rather than a full drain: one run that tries to push ten thousand passes
    // would hit the platform's time limit and leave the rest in limbo.
    take: 25,
    select: { id: true },
  })

  let delivered = 0
  let failed = 0
  for (const { id } of due) {
    const result = await deliverCardMessage(id)
    if (result.error) failed++
    else delivered++
  }

  return { delivered, failed }
}
