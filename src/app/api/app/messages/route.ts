import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireAppUser } from '@/lib/auth/app-session'
import { deliverCardMessage, MESSAGE_MAX_LENGTH } from '@/lib/cards/message-service'
import {
  MAX_SCHEDULE_AHEAD_MS,
  MIN_SCHEDULE_AHEAD_MS,
  MONTHLY_IMMEDIATE_LIMIT,
  MONTHLY_SCHEDULED_LIMIT,
  PWA_DEFAULT_SEGMENT,
  classifyMessage,
  countUsage,
  monthRange,
  quotaMessage,
  remaining,
  type MessageKind,
} from '@/lib/cards/message-quota'

export const runtime = 'nodejs'

/**
 * Nachrichten an alle Karteninhaber — aus der Betriebs-App.
 *
 * Das Dashboard kann das längst; der PWA fehlte bisher jeder Weg dorthin, sie konnte nur
 * wiederkehrende Erinnerungen anlegen. Diese Route schließt die Lücke und nutzt dafür
 * denselben Versand wie das Dashboard (deliverCardMessage).
 *
 * Der Unterschied zum Dashboard ist die Grenze: je Karte und Kalendermonat eine sofortige
 * und eine geplante Nachricht. Sie steht hier im Server und nicht in der Oberfläche —
 * eine Regel, die sich mit den Entwicklerwerkzeugen des Browsers abschalten lässt, ist
 * keine Regel.
 *
 * Eine Gruppenauswahl bietet die PWA nicht an; es geht immer an alle Karteninhaber.
 */

const createSchema = z.object({
  cardId: z.string().cuid(),
  headline: z.preprocess(
    (v) => (typeof v === 'string' && v.trim().length === 0 ? null : v),
    z.string().trim().max(60).nullable().default(null),
  ),
  body: z
    .string()
    .trim()
    .min(1, 'Bitte einen Text eingeben.')
    .max(MESSAGE_MAX_LENGTH, 'Der Text ist zu lang — mehr zeigt iOS nicht.'),
  /** Null heißt „jetzt". Ein Zeitpunkt heißt „geplant" und zählt auf das andere Kontingent. */
  scheduledFor: z.string().datetime().nullable().default(null),
})

/** Die Nachrichten einer Karte, die in den Monat dieses Zeitpunkts fallen. */
async function usageForMonth(cardId: string, when: Date) {
  const { start, end } = monthRange(when)
  const rows = await prisma.cardMessage.findMany({
    where: { cardId, scheduledFor: { gte: start, lt: end } },
    select: { scheduledFor: true, createdAt: true },
  })
  return countUsage(rows)
}

interface MessageDTO {
  id: string
  cardId: string
  cardName: string
  body: string
  kind: MessageKind
  scheduledFor: string
  sentAt: string | null
  recipients: number
  error: string | null
}

function limitsDTO() {
  return { immediatePerMonth: MONTHLY_IMMEDIATE_LIMIT, scheduledPerMonth: MONTHLY_SCHEDULED_LIMIT }
}

/**
 * Was die PWA zum Zeichnen braucht: die letzten Nachrichten und das, was diesen Monat noch
 * übrig ist — je Karte, damit die Oberfläche beim Wechsel der Karte nicht nachladen muss.
 */
export async function GET(request: Request): Promise<Response> {
  const appUser = await requireAppUser(request)
  if (!appUser) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 })

  const cards = await prisma.card.findMany({
    where: { orgId: appUser.orgId },
    select: { id: true, name: true },
  })
  const cardIds = cards.map((c) => c.id)
  if (cardIds.length === 0) {
    return NextResponse.json({ quota: [], messages: [], limits: limitsDTO() })
  }

  const now = new Date()
  const { start, end } = monthRange(now)

  const [thisMonth, recent] = await Promise.all([
    prisma.cardMessage.findMany({
      where: { cardId: { in: cardIds }, scheduledFor: { gte: start, lt: end } },
      select: { cardId: true, scheduledFor: true, createdAt: true },
    }),
    prisma.cardMessage.findMany({
      where: { cardId: { in: cardIds } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        cardId: true,
        body: true,
        scheduledFor: true,
        createdAt: true,
        sentAt: true,
        recipients: true,
        error: true,
        card: { select: { name: true } },
      },
    }),
  ])

  const quota = cards.map((card) => {
    const usage = countUsage(thisMonth.filter((m) => m.cardId === card.id))
    return {
      cardId: card.id,
      cardName: card.name,
      immediateLeft: remaining(usage, 'IMMEDIATE'),
      scheduledLeft: remaining(usage, 'SCHEDULED'),
    }
  })

  const messages: MessageDTO[] = recent.map((m) => ({
    id: m.id,
    cardId: m.cardId,
    cardName: m.card.name,
    body: m.body,
    kind: classifyMessage(m),
    scheduledFor: m.scheduledFor.toISOString(),
    sentAt: m.sentAt ? m.sentAt.toISOString() : null,
    recipients: m.recipients,
    error: m.error,
  }))

  return NextResponse.json({ quota, messages, limits: limitsDTO() })
}

export async function POST(request: Request): Promise<Response> {
  const appUser = await requireAppUser(request)
  if (!appUser) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 })
  if (appUser.role === 'AGENCY') {
    return NextResponse.json(
      { error: 'Agentur-Konten dürfen keine Nachrichten verschicken.' },
      { status: 403 },
    )
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
    return NextResponse.json(
      { error: first?.message ?? 'Ungültige Eingabe.', code: 'invalid' },
      { status: 400 },
    )
  }

  // Mandantentrennung: nur eigene Karten — sonst schriebe ein Betrieb fremde Kunden an.
  const card = await prisma.card.findFirst({
    where: { id: parsed.data.cardId, orgId: appUser.orgId },
    select: { id: true },
  })
  if (!card) {
    return NextResponse.json({ error: 'Karte nicht gefunden.', code: 'not_found' }, { status: 404 })
  }

  const now = Date.now()
  let scheduledFor: Date
  let kind: MessageKind

  if (parsed.data.scheduledFor) {
    scheduledFor = new Date(parsed.data.scheduledFor)
    kind = 'SCHEDULED'
    const ahead = scheduledFor.getTime() - now
    if (ahead < MIN_SCHEDULE_AHEAD_MS) {
      return NextResponse.json(
        {
          error: 'Der Zeitpunkt muss mindestens fünf Minuten in der Zukunft liegen.',
          code: 'too_soon',
        },
        { status: 400 },
      )
    }
    if (ahead > MAX_SCHEDULE_AHEAD_MS) {
      return NextResponse.json(
        { error: 'Höchstens ein Jahr im Voraus.', code: 'too_far' },
        { status: 400 },
      )
    }
  } else {
    scheduledFor = new Date(now)
    kind = 'IMMEDIATE'
  }

  /*
   * Gezählt wird im Monat des Versands, nicht im Monat des Anlegens.
   *
   * Sonst ließen sich im Oktober zwölf Nachrichten für Dezember einstellen und die Grenze
   * wäre eine Formalie.
   */
  const usage = await usageForMonth(card.id, scheduledFor)
  if (remaining(usage, kind) <= 0) {
    return NextResponse.json({ error: quotaMessage(kind), code: 'quota' }, { status: 409 })
  }

  const created = await prisma.cardMessage.create({
    data: {
      cardId: card.id,
      headline: parsed.data.headline,
      body: parsed.data.body,
      segment: PWA_DEFAULT_SEGMENT,
      scheduledFor,
      createdBy: appUser.userId,
    },
    select: { id: true },
  })

  // Fällig heißt sofort: Der Zeitplaner ist für später da, nicht für jetzt. Ohne das
  // wartet der Betrieb auf einen Lauf, der Stunden entfernt sein kann.
  if (kind === 'IMMEDIATE') await deliverCardMessage(created.id)

  return NextResponse.json({
    ok: true,
    id: created.id,
    kind,
    scheduledFor: scheduledFor.toISOString(),
  })
}
