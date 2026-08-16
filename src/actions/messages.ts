'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { assertCardAccess } from '@/lib/auth/session'
import { fail, fromZodError, guarded, ok, type ActionResult } from '@/lib/action-result'
import { prisma } from '@/lib/db'
import { deliverCardMessage, MESSAGE_MAX_LENGTH } from '@/lib/cards/message-service'

/**
 * Messages a shop sends to everyone holding one of its cards.
 *
 * Scheduling and sending are the same action with a different date: "now" is simply a
 * scheduled time that has already passed, and it is delivered immediately rather than
 * waiting for the next run. That keeps one code path for both instead of two that can
 * drift.
 */

export interface CardMessageSummary {
  id: string
  headline: string | null
  body: string
  scheduledFor: string
  sentAt: string | null
  appleDevices: number
  googleSynced: boolean
  error: string | null
}

const createInputSchema = z.object({
  cardId: z.string().cuid(),
  headline: z.preprocess(
    (v) => (typeof v === 'string' && v.trim().length === 0 ? null : v),
    z.string().trim().max(60).nullable(),
  ),
  body: z
    .string()
    .trim()
    .min(1, 'Bitte einen Text eingeben.')
    .max(MESSAGE_MAX_LENGTH, `Höchstens ${MESSAGE_MAX_LENGTH} Zeichen — mehr zeigt iOS nicht.`),
  /** ISO string, or null for "right now". */
  scheduledFor: z.string().datetime().nullable().default(null),
})

function toSummary(row: {
  id: string
  headline: string | null
  body: string
  scheduledFor: Date
  sentAt: Date | null
  appleDevices: number
  googleSynced: boolean
  error: string | null
}): CardMessageSummary {
  return {
    id: row.id,
    headline: row.headline,
    body: row.body,
    scheduledFor: row.scheduledFor.toISOString(),
    sentAt: row.sentAt?.toISOString() ?? null,
    appleDevices: row.appleDevices,
    googleSynced: row.googleSynced,
    error: row.error,
  }
}

export async function listCardMessagesAction(
  cardId: string,
): Promise<ActionResult<CardMessageSummary[]>> {
  return guarded(async () => {
    const parsed = z.string().cuid().safeParse(cardId)
    if (!parsed.success) return fail('Ungültige Karten-ID.', 'validation')

    await assertCardAccess(parsed.data)

    const rows = await prisma.cardMessage.findMany({
      where: { cardId: parsed.data },
      orderBy: { createdAt: 'desc' },
      take: 10,
    })
    return ok(rows.map(toSummary))
  })
}

export async function createCardMessageAction(
  input: unknown,
): Promise<ActionResult<CardMessageSummary>> {
  return guarded(async () => {
    const parsed = createInputSchema.safeParse(input)
    if (!parsed.success) return fromZodError(parsed.error)

    const { session } = await assertCardAccess(parsed.data.cardId)

    const scheduledFor = parsed.data.scheduledFor ? new Date(parsed.data.scheduledFor) : new Date()

    const created = await prisma.cardMessage.create({
      data: {
        cardId: parsed.data.cardId,
        headline: parsed.data.headline,
        body: parsed.data.body,
        scheduledFor,
        createdBy: session.userId,
      },
    })

    // Due already? Then send it here rather than making the shop wait for a run that may
    // be hours away — the scheduler exists for the future, not for "now".
    if (scheduledFor.getTime() <= Date.now()) {
      await deliverCardMessage(created.id)
    }

    revalidatePath(`/dashboard/karten/${parsed.data.cardId}`)

    const fresh = await prisma.cardMessage.findFirst({ where: { id: created.id } })
    return ok(toSummary(fresh ?? created))
  })
}

/** Withdraws a message that has not gone out yet. */
export async function cancelCardMessageAction(messageId: string): Promise<ActionResult<null>> {
  return guarded(async () => {
    const parsed = z.string().cuid().safeParse(messageId)
    if (!parsed.success) return fail('Ungültige ID.', 'validation')

    const message = await prisma.cardMessage.findFirst({
      where: { id: parsed.data },
      select: { cardId: true, sentAt: true },
    })
    if (!message) return fail('Nachricht nicht gefunden.', 'not_found')

    await assertCardAccess(message.cardId)

    // A sent message cannot be recalled — it is already on the customers' phones. Saying so
    // beats deleting the row and pretending it never happened.
    if (message.sentAt) {
      return fail('Diese Nachricht wurde bereits versendet und lässt sich nicht zurückholen.', 'validation')
    }

    await prisma.cardMessage.delete({ where: { id: parsed.data } })
    revalidatePath(`/dashboard/karten/${message.cardId}`)
    return ok(null)
  })
}
