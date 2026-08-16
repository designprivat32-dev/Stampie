import 'server-only'
import { prisma } from '@/lib/db'
import { pushAppleWalletUpdateForCard } from '@/lib/wallet/apple-sync'
import { sendGoogleWalletMessage } from '@/lib/wallet/google-sync'

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
      card: { select: { kind: true, activeMessage: true } },
    },
  })
  if (!message) return { appleDevices: 0, googleSynced: false, error: 'Nachricht nicht gefunden.' }

  const problems: string[] = []

  /*
   * Apple notifies only when the field's value actually differs. Sending the same text
   * twice would update nothing and notify nobody — so say that plainly instead of
   * reporting a delivery that never happened.
   */
  let appleDevices = 0
  if (message.card.activeMessage?.trim() === message.body.trim()) {
    problems.push(
      'Apple: identischer Text wie zuletzt — iPhones zeigen dafür keine Meldung. Bitte umformulieren.',
    )
  } else {
    await prisma.card.update({
      where: { id: message.cardId },
      data: { activeMessage: message.body, activeMessageAt: new Date() },
    })
    // Marks the passes as changed and knocks on every registered phone; each one then
    // fetches a pass whose message field carries the new text.
    const push = await pushAppleWalletUpdateForCard(message.cardId)
    appleDevices = push.devices
    if (push.failed > 0) problems.push(`Apple: ${push.failed} Karten nicht erreicht.`)
  }

  const google = await sendGoogleWalletMessage(
    message.cardId,
    { headline: message.headline, body: message.body },
    message.card.kind,
  )
  if (google.status === 'error') problems.push(`Google: ${google.message}`)

  const result: MessageDeliveryResult = {
    appleDevices,
    googleSynced: google.status === 'updated',
    error: problems.length > 0 ? problems.join(' ') : null,
  }

  // Written even when something failed: a half-delivered message must not be sent again by
  // the next run, or the shops that did receive it get it twice.
  await prisma.cardMessage.update({
    where: { id: message.id },
    data: {
      sentAt: new Date(),
      appleDevices: result.appleDevices,
      googleSynced: result.googleSynced,
      error: result.error,
    },
  })

  return result
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
