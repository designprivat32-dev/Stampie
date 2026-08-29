import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireAppUser } from '@/lib/auth/app-session'
import { MESSAGE_MAX_LENGTH } from '@/lib/cards/message-service'

export const runtime = 'nodejs'

/**
 * Wiederkehrende Erinnerungen der Betriebs-App.
 *
 * Ein Betrieb legt hier fest: „alle N Tage geht diese Nachricht an alle Kunden dieser
 * Karte". Der tägliche Cron-Lauf verschickt sie (siehe `reminder-service`).
 *
 * Absicherung wie überall im App-API: nur Karten des eingeloggten Betriebs.
 */

const DAY_MS = 24 * 60 * 60 * 1000

const createSchema = z.object({
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
  intervalDays: z.number().int().min(1, 'Mindestens 1 Tag.').max(365, 'Höchstens 365 Tage.'),
})

interface ReminderDTO {
  id: string
  cardId: string
  cardName: string
  headline: string | null
  body: string
  intervalDays: number
  enabled: boolean
  nextSendAt: string
  lastSentAt: string | null
  sentCount: number
}

/** Alle Erinnerungen der Karten dieses Betriebs. */
export async function GET(request: Request): Promise<Response> {
  const appUser = await requireAppUser(request)
  if (!appUser) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 })

  const rows = await prisma.cardReminder.findMany({
    where: { card: { orgId: appUser.orgId } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      cardId: true,
      headline: true,
      body: true,
      intervalDays: true,
      enabled: true,
      nextSendAt: true,
      lastSentAt: true,
      sentCount: true,
      card: { select: { name: true } },
    },
  })

  const reminders: ReminderDTO[] = rows.map((r) => ({
    id: r.id,
    cardId: r.cardId,
    cardName: r.card.name,
    headline: r.headline,
    body: r.body,
    intervalDays: r.intervalDays,
    enabled: r.enabled,
    nextSendAt: r.nextSendAt.toISOString(),
    lastSentAt: r.lastSentAt?.toISOString() ?? null,
    sentCount: r.sentCount,
  }))

  return NextResponse.json({ reminders })
}

/** Neue Erinnerung anlegen. Der erste Versand ist nach einem Intervall fällig. */
export async function POST(request: Request): Promise<Response> {
  const appUser = await requireAppUser(request)
  if (!appUser) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 })
  if (appUser.role === 'AGENCY') {
    return NextResponse.json({ error: 'Agentur-Konten dürfen keine Erinnerungen anlegen.' }, { status: 403 })
  }

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 })
  }

  const parsed = createSchema.safeParse(json)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return NextResponse.json({ error: first?.message ?? 'Ungültige Eingabe.', code: 'invalid' }, { status: 400 })
  }

  // Die Karte muss zu diesem Betrieb gehören — sonst könnte man fremde Kunden anschreiben.
  const card = await prisma.card.findFirst({
    where: { id: parsed.data.cardId, orgId: appUser.orgId },
    select: { id: true },
  })
  if (!card) {
    return NextResponse.json({ error: 'Karte nicht gefunden.', code: 'not_found' }, { status: 404 })
  }

  const nextSendAt = new Date(Date.now() + parsed.data.intervalDays * DAY_MS)

  const created = await prisma.cardReminder.create({
    data: {
      cardId: parsed.data.cardId,
      headline: parsed.data.headline,
      body: parsed.data.body,
      intervalDays: parsed.data.intervalDays,
      nextSendAt,
      createdBy: appUser.userId,
    },
    select: { id: true, nextSendAt: true },
  })

  return NextResponse.json({
    ok: true,
    id: created.id,
    nextSendAt: created.nextSendAt.toISOString(),
  })
}
