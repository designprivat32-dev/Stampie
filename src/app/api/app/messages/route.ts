import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { loyaltyCardWhere } from '@/lib/cards/kind'
import { requireAppUser } from '@/lib/auth/app-session'
import { deliverCardMessage, MESSAGE_MAX_LENGTH } from '@/lib/cards/message-service'
import {
  MONTHLY_IMMEDIATE_LIMIT,
  MONTHLY_RECURRING_LIMIT,
  PWA_DEFAULT_SEGMENT,
  QUOTA_MESSAGE_IMMEDIATE,
  QUOTA_MESSAGE_MONTHLY,
  classifyMessage,
  countManual,
  monthRange,
  remainingManual,
  type MessageOrigin,
} from '@/lib/cards/message-quota'
import { MAX_DAY_OF_MONTH, nextMonthlyDue } from '@/lib/cards/monthly-message-service'

export const runtime = 'nodejs'

/**
 * Nachrichten an alle Karteninhaber — aus der Betriebs-App.
 *
 * Das Dashboard kann das längst; der PWA fehlte bisher jeder Weg dorthin, sie konnte nur
 * wiederkehrende Erinnerungen an einzelne Kunden anlegen. Diese Route schließt die Lücke
 * und nutzt denselben Versand wie das Dashboard (`deliverCardMessage`).
 *
 * Zwei Wege, zwei Kontingente:
 *  - `mode: "now"` schickt sofort, einmal je Karte und Kalendermonat;
 *  - `mode: "monthly"` richtet die Monatsnachricht ein, höchstens eine aktive je Karte.
 *
 * Die Grenzen stehen hier im Server und nicht in der Oberfläche — eine Regel, die sich mit
 * den Entwicklerwerkzeugen des Browsers abschalten lässt, ist keine Regel.
 *
 * Eine Gruppenauswahl bietet die PWA nicht an; es geht immer an alle Karteninhaber.
 */

const createSchema = z
  .object({
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
    mode: z.enum(['now', 'monthly']).default('now'),
    /** Nur für `monthly`. Höchstens 28, weil es nur diese Tage in jedem Monat gibt. */
    dayOfMonth: z.number().int().min(1).max(MAX_DAY_OF_MONTH).default(1),
  })
  .strict()

interface MessageDTO {
  id: string
  cardId: string
  cardName: string
  body: string
  origin: MessageOrigin
  scheduledFor: string
  sentAt: string | null
  recipients: number
  error: string | null
}

interface MonthlyDTO {
  id: string
  cardId: string
  cardName: string
  body: string
  dayOfMonth: number
  nextSendAt: string
  lastSentAt: string | null
}

function limitsDTO() {
  return { immediatePerMonth: MONTHLY_IMMEDIATE_LIMIT, monthlyPerCard: MONTHLY_RECURRING_LIMIT }
}

/**
 * Was die PWA zum Zeichnen braucht: das Rest-Kontingent je Karte, die laufende
 * Monatsnachricht und die letzten Versände — alles in einem Aufruf, damit die Oberfläche
 * beim Wechsel der Karte nicht nachladen muss.
 */
export async function GET(request: Request): Promise<Response> {
  const appUser = await requireAppUser(request)
  if (!appUser) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 })

  const cards = await prisma.card.findMany({
    where: { orgId: appUser.orgId, ...loyaltyCardWhere() },
    select: { id: true, name: true },
  })
  const cardIds = cards.map((c) => c.id)
  if (cardIds.length === 0) {
    return NextResponse.json({ quota: [], monthly: [], messages: [], limits: limitsDTO() })
  }

  const { start, end } = monthRange(new Date())

  const [thisMonth, monthlyRows, recent] = await Promise.all([
    prisma.cardMessage.findMany({
      where: { cardId: { in: cardIds }, scheduledFor: { gte: start, lt: end } },
      select: { cardId: true, monthlyMessageId: true },
    }),
    prisma.cardMonthlyMessage.findMany({
      where: { cardId: { in: cardIds }, enabled: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        cardId: true,
        body: true,
        dayOfMonth: true,
        nextSendAt: true,
        lastSentAt: true,
        card: { select: { name: true } },
      },
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
        sentAt: true,
        recipients: true,
        error: true,
        monthlyMessageId: true,
        card: { select: { name: true } },
      },
    }),
  ])

  const monthlyByCard = new Set(monthlyRows.map((m) => m.cardId))

  const quota = cards.map((card) => ({
    cardId: card.id,
    cardName: card.name,
    immediateLeft: remainingManual(countManual(thisMonth.filter((m) => m.cardId === card.id))),
    monthlyActive: monthlyByCard.has(card.id),
  }))

  const monthly: MonthlyDTO[] = monthlyRows.map((m) => ({
    id: m.id,
    cardId: m.cardId,
    cardName: m.card.name,
    body: m.body,
    dayOfMonth: m.dayOfMonth,
    nextSendAt: m.nextSendAt.toISOString(),
    lastSentAt: m.lastSentAt ? m.lastSentAt.toISOString() : null,
  }))

  const messages: MessageDTO[] = recent.map((m) => ({
    id: m.id,
    cardId: m.cardId,
    cardName: m.card.name,
    body: m.body,
    origin: classifyMessage(m),
    scheduledFor: m.scheduledFor.toISOString(),
    sentAt: m.sentAt ? m.sentAt.toISOString() : null,
    recipients: m.recipients,
    error: m.error,
  }))

  return NextResponse.json({ quota, monthly, messages, limits: limitsDTO() })
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
    where: { id: parsed.data.cardId, orgId: appUser.orgId, ...loyaltyCardWhere() },
    select: { id: true },
  })
  if (!card) {
    return NextResponse.json({ error: 'Karte nicht gefunden.', code: 'not_found' }, { status: 404 })
  }

  if (parsed.data.mode === 'monthly') {
    const running = await prisma.cardMonthlyMessage.count({
      where: { cardId: card.id, enabled: true },
    })
    if (running >= MONTHLY_RECURRING_LIMIT) {
      return NextResponse.json({ error: QUOTA_MESSAGE_MONTHLY, code: 'quota' }, { status: 409 })
    }

    const nextSendAt = nextMonthlyDue(parsed.data.dayOfMonth)
    const created = await prisma.cardMonthlyMessage.create({
      data: {
        cardId: card.id,
        headline: parsed.data.headline,
        body: parsed.data.body,
        dayOfMonth: parsed.data.dayOfMonth,
        nextSendAt,
        createdBy: appUser.userId,
      },
      select: { id: true },
    })

    return NextResponse.json({
      ok: true,
      id: created.id,
      mode: 'monthly',
      nextSendAt: nextSendAt.toISOString(),
    })
  }

  const now = new Date()
  const { start, end } = monthRange(now)
  const thisMonth = await prisma.cardMessage.findMany({
    where: { cardId: card.id, scheduledFor: { gte: start, lt: end } },
    select: { monthlyMessageId: true },
  })
  if (remainingManual(countManual(thisMonth)) <= 0) {
    return NextResponse.json({ error: QUOTA_MESSAGE_IMMEDIATE, code: 'quota' }, { status: 409 })
  }

  const created = await prisma.cardMessage.create({
    data: {
      cardId: card.id,
      headline: parsed.data.headline,
      body: parsed.data.body,
      segment: PWA_DEFAULT_SEGMENT,
      scheduledFor: now,
      createdBy: appUser.userId,
    },
    select: { id: true },
  })

  // Sofort heißt sofort: Der Zeitplaner ist für später da, nicht für jetzt. Ohne das
  // wartet der Betrieb auf einen Lauf, der Stunden entfernt sein kann.
  await deliverCardMessage(created.id)

  return NextResponse.json({ ok: true, id: created.id, mode: 'now' })
}
