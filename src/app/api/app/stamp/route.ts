import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireAppUser } from '@/lib/auth/app-session'
import {
  MAX_STAMPS_PER_BOOKING,
  STAMP_COOLDOWN_MS,
  decideRedeem,
  decideStamp,
  extractSerial,
  formatCooldown,
} from '@/lib/cards/stamping'
import { rateLimit } from '@/lib/rate-limit'
import { pushAppleWalletUpdate } from '@/lib/wallet/apple-sync'
import { syncGoogleStampCount } from '@/lib/wallet/google-sync'
import { loadPublishedDesign } from '@/lib/cards/repository'

export const runtime = 'nodejs'

/**
 * The core of the business app: scan a customer QR → +1 on that customer's card.
 *
 * Security: the scanned pass must belong to a card of the *logged-in* business. A hairdresser
 * scanning a pizzeria's customer card is rejected with 403 — the tenancy check is here on the
 * server, never trusted to the app.
 */

const bodySchema = z.object({
  scanned: z.string().min(1).max(400),
  /**
   * Wie viele Stempel diese Buchung vergibt — drei Kaffee auf einmal sind ein Vorgang.
   * Ohne Angabe einer, damit ältere App-Versionen unverändert weiterlaufen.
   */
  count: z.number().int().min(1).max(MAX_STAMPS_PER_BOOKING).default(1),
})

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

  /*
   * Massgeblich ist das aktuelle Design, nicht das beim Ausgeben eingefrorene Ziel.
   *
   * Aendert ein Betrieb die Stempelzahl, soll sie fuer alle Karten gelten -- sonst laufen
   * mehrere Ziele nebeneinander und niemand weiss mehr, welche Karte wann voll ist.
   * `IssuedPass.stampGoal` wird bei jeder Buchung nachgezogen und bleibt damit ehrlich,
   * statt einen Stand zu behaupten, gegen den niemand rechnet.
   */
  const design = await loadPublishedDesign(pass.cardId)
  const goal = design?.stampGoal ?? pass.stampGoal

  const decision = decideStamp({
    stamps: pass.stamps,
    stampGoal: goal,
    lastStampAt: last?.createdAt ?? null,
    requested: parsed.data.count,
  })

  if (!decision.ok) {
    /*
     * Volle Karte: einlösen statt abweisen.
     *
     * Vorher antwortete diese Stelle „bitte zuerst die Belohnung einlösen" — nur gab es in
     * der App keinen Weg dorthin. Der Kassierer stand damit vor einer Karte, die sich weder
     * stempeln noch einlösen ließ. Ein zweiter Scan auf der vollen Karte ist genau die
     * Geste, die im Laden passiert: Kunde legt die volle Karte hin, bekommt seine
     * Belohnung, die Karte fängt von vorn an.
     *
     * Übrige Stempel bleiben erhalten (siehe `decideRedeem`) — wer bei einem Ziel von 10
     * mit 12 kommt, startet danach mit 2 und verliert nichts.
     */
    if (decision.reason === 'already_full') {
      return redeemFullCard(pass, goal, parsed.data.count, serial, appUser.userId)
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
      data: { stamps: decision.nextBalance, stampGoal: goal },
    })
    await tx.stampEvent.create({
      data: {
        passId: pass.id,
        cardId: pass.cardId,
        kind: 'STAMP',
        // Eine Buchung, ein Eintrag: die Prüfspur soll zeigen, was der Kassierer getan
        // hat, nicht drei erfundene Einzelscans.
        delta: decision.booked,
        balance: decision.nextBalance,
        stampedBy: appUser.userId,
      },
    })
    return next
  })

  // Best-effort: the stamp is booked and audited, so a phone that is off must not turn a
  // successful scan into an error at the till. Beide Wallets aktualisieren — sonst zählt der
  // Google-Wallet-Pass des Kunden beim Stempeln über die App nicht hoch (Apple schon).
  await Promise.all([
    pushAppleWalletUpdate(serial),
    design ? syncGoogleStampCount(pass.cardId, serial, updated.stamps, design) : Promise.resolve(),
  ])

  return NextResponse.json({
    ok: true,
    serial,
    stamps: updated.stamps,
    stampGoal: updated.stampGoal,
    /** Was wirklich gebucht wurde — am Ziel gedeckelt, kann also unter `count` liegen. */
    booked: decision.booked,
    completesCard: decision.completesCard,
    redeemed: false,
  })
}

interface FullPass {
  id: string
  stamps: number
  stampGoal: number
  cardId: string
}

/**
 * Löst eine volle Karte ein und setzt sie zurück.
 *
 * Eigene Sperrfrist gegen den Doppelscan: bei Übertrag kann eine Karte nach dem Einlösen
 * sofort wieder voll sein — 20 Stempel bei einem Ziel von 10. Ohne diese Prüfung machte
 * ein zweimal ausgelöster Scanner aus einer Belohnung zwei, und eine Belohnung ist Geld.
 */
async function redeemFullCard(
  pass: FullPass,
  /** Das aktuelle Ziel aus dem Design — dieselbe Zahl, gegen die gestempelt wird. */
  goal: number,
  /** Der Besuch, bei dem eingelöst wird, zählt für die neue Karte mit. */
  count: number,
  serial: string,
  userId: string,
): Promise<Response> {
  const lastRedeem = await prisma.stampEvent.findFirst({
    where: { passId: pass.id, kind: 'REDEEM' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })
  if (lastRedeem) {
    const elapsed = Date.now() - lastRedeem.createdAt.getTime()
    if (elapsed < STAMP_COOLDOWN_MS) {
      return NextResponse.json(
        {
          error: `Gerade eben schon eingelöst. In ${formatCooldown(STAMP_COOLDOWN_MS - elapsed)} erneut versuchen.`,
          code: 'cooldown',
          stamps: pass.stamps,
          stampGoal: goal,
        },
        { status: 409 },
      )
    }
  }

  const decision = decideRedeem({ stamps: pass.stamps, stampGoal: goal })
  // Kann hier nicht eintreten — die Karte ist voll, sonst wären wir nicht hier. Der Zweig
  // steht, damit ein späterer Umbau der Regel nicht still eine Belohnung verschenkt.
  if (!decision.ok) {
    return NextResponse.json(
      { error: 'Die Karte ist noch nicht voll.', code: 'not_full' },
      { status: 409 },
    )
  }

  /*
   * Der Besuch, bei dem eingelöst wird, zählt schon für die neue Karte.
   *
   * Sonst geht der Kunde mit einer leeren Karte aus dem Laden, obwohl er gerade da war und
   * bezahlt hat — er müsste beim nächsten Mal noch einmal für denselben Besuch anstehen.
   * Übertrag und Neustempel addieren sich: wer mit 12 bei einem Ziel von 10 kommt, hat
   * danach 2 aus dem Übertrag plus den heutigen.
   */
  const booked = Math.max(0, Math.min(count, goal - decision.nextBalance))
  const finalBalance = decision.nextBalance + booked

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.issuedPass.update({
      where: { id: pass.id },
      data: {
        stamps: finalBalance,
        stampGoal: goal,
        rewardCount: { increment: 1 },
        lastRewardAt: new Date(),
      },
    })
    // Zwei Einträge, nicht einer: die Prüfspur soll zeigen, dass eingelöst *und* gestempelt
    // wurde. Eine verrechnete Zahl liesse sich später nicht mehr auseinandernehmen.
    await tx.stampEvent.create({
      data: {
        passId: pass.id,
        cardId: pass.cardId,
        kind: 'REDEEM',
        delta: -goal,
        balance: decision.nextBalance,
        stampedBy: userId,
      },
    })
    if (booked > 0) {
      await tx.stampEvent.create({
        data: {
          passId: pass.id,
          cardId: pass.cardId,
          kind: 'STAMP',
          delta: booked,
          balance: finalBalance,
          stampedBy: userId,
        },
      })
    }
    return next
  })

  const design = await loadPublishedDesign(pass.cardId)
  await Promise.all([
    pushAppleWalletUpdate(serial),
    design ? syncGoogleStampCount(pass.cardId, serial, updated.stamps, design) : Promise.resolve(),
  ])

  return NextResponse.json({
    ok: true,
    serial,
    stamps: updated.stamps,
    stampGoal: updated.stampGoal,
    booked: booked,
    completesCard: finalBalance >= goal,
    /** Die App zeigt daraufhin „Belohnung eingelöst" statt „gestempelt". */
    redeemed: true,
    rewardCount: updated.rewardCount,
  })
}
