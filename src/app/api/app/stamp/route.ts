import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireAppUser } from '@/lib/auth/app-session'
import { decideStamp, extractSerial, formatCooldown } from '@/lib/cards/stamping'
import { rateLimit } from '@/lib/rate-limit'
import { pushAppleWalletUpdate } from '@/lib/wallet/apple-sync'

export const runtime = 'nodejs'

/**
 * The core of the business app: scan a customer QR → +1 on that customer's card.
 *
 * Security: the scanned pass must belong to a card of the *logged-in* business. A hairdresser
 * scanning a pizzeria's customer card is rejected with 403 — the tenancy check is here on the
 * server, never trusted to the app.
 */

const bodySchema = z.object({ scanned: z.string().min(1).max(400) })

export async function POST(request: Request): Promise<Response> {
  const appUser = await requireAppUser(request)
  if (!appUser) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 })
  if (appUser.role === 'AGENCY') {
    return NextResponse.json({ error: 'Agentur-Konten dürfen nicht stempeln.' }, { status: 403 })
  }

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Kein Code übermittelt.', code: 'invalid' }, { status: 400 })
  }

  // Cap the whole till, not the individual card — a scanner on a screen fires continuously.
  if (!rateLimit(`app-stamp:${appUser.orgId}`, 600, 60 * 60 * 1000).allowed) {
    return NextResponse.json(
      { error: 'Zu viele Buchungen in kurzer Zeit. Bitte kurz warten.', code: 'rate_limited' },
      { status: 429 },
    )
  }

  const serial = extractSerial(parsed.data.scanned)
  if (!serial) {
    return NextResponse.json(
      { error: 'Dieser Code enthält keine gültige Kartennummer.', code: 'invalid' },
      { status: 422 },
    )
  }

  const pass = await prisma.issuedPass.findFirst({
    where: { serial },
    select: {
      id: true,
      stamps: true,
      stampGoal: true,
      cardId: true,
      card: { select: { orgId: true } },
    },
  })

  // Der Pass ist weg — das Kartenprogramm wurde hart gelöscht (Cascade) oder der QR stammt
  // aus einer anderen Welt. Eigene Antwort, weil „gibt es nicht mehr" an der Kasse etwas
  // anderes bedeutet als „gehört jemand anderem": nur so kann die App den Kassierer davon
  // abhalten, es dreimal zu versuchen.
  if (!pass) {
    return NextResponse.json(
      {
        error: 'Diese Karte gibt es nicht mehr. Sie wurde gelöscht und kann nicht gestempelt werden.',
        code: 'not_found',
      },
      { status: 404 },
    )
  }

  if (pass.card.orgId !== appUser.orgId) {
    return NextResponse.json(
      { error: 'Diese Karte gehört nicht zu deinem Betrieb.', code: 'forbidden' },
      { status: 403 },
    )
  }

  const last = await prisma.stampEvent.findFirst({
    where: { passId: pass.id, kind: 'STAMP' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })

  const decision = decideStamp({
    stamps: pass.stamps,
    stampGoal: pass.stampGoal,
    lastStampAt: last?.createdAt ?? null,
  })

  if (!decision.ok) {
    if (decision.reason === 'already_full') {
      return NextResponse.json(
        {
          error: 'Karte ist voll — bitte zuerst die Belohnung einlösen.',
          code: 'full',
          stamps: pass.stamps,
          stampGoal: pass.stampGoal,
        },
        { status: 409 },
      )
    }
    return NextResponse.json(
      {
        error: `Gerade eben schon gestempelt. In ${formatCooldown(decision.retryInMs)} erneut versuchen.`,
        code: 'cooldown',
      },
      { status: 409 },
    )
  }

  // Counter and audit entry move together — a stamp without a trace is not acceptable.
  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.issuedPass.update({
      where: { id: pass.id },
      data: { stamps: decision.nextBalance },
    })
    await tx.stampEvent.create({
      data: {
        passId: pass.id,
        cardId: pass.cardId,
        kind: 'STAMP',
        delta: 1,
        balance: decision.nextBalance,
        stampedBy: appUser.userId,
      },
    })
    return next
  })

  // Best-effort: the stamp is booked and audited, so a phone that is off must not turn a
  // successful scan into an error at the till.
  await pushAppleWalletUpdate(serial)

  return NextResponse.json({
    ok: true,
    serial,
    stamps: updated.stamps,
    stampGoal: updated.stampGoal,
    completesCard: decision.completesCard,
  })
}
