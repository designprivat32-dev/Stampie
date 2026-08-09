'use server'

import { z } from 'zod'
import { assertStampAccess, assertCardAccess } from '@/lib/auth/session'
import { fail, fromZodError, guarded, ok, type ActionResult } from '@/lib/action-result'
import { prisma } from '@/lib/db'
import { decideRedeem, decideStamp, extractSerial, formatCooldown } from '@/lib/cards/stamping'
import { expireGoogleOffer, syncGoogleStampCount } from '@/lib/wallet/google-sync'
import { loadOrCreateDraft, loadPublishedDesign } from '@/lib/cards/repository'
import type { CardDesignInput } from '@/lib/cards/schema'
import { rateLimit } from '@/lib/rate-limit'

/**
 * The counter behind the card. Every action here is tenant-scoped and audited — a stamp
 * is worth money, so "who booked what, when" has to be reconstructible.
 */

const scanInputSchema = z.object({
  cardId: z.string().cuid(),
  scanned: z.string().min(1).max(300),
})

export interface PassSummary {
  serial: string
  stamps: number
  stampGoal: number
  isTest: boolean
  rewardCount: number
  lastStampAt: string | null
  /** German label from the design, e.g. "Kaffee". */
  stampLabel: string
  rewardText: string
  /** COUPON passes are single-use; non-null means it is spent. */
  redeemedAt: string | null
  /** The offer, so the till can show what it is handing out. */
  offerTitle: string | null
}

function toLabels(design: CardDesignInput): {
  stampLabel: string
  rewardText: string
  offerTitle: string | null
} {
  return {
    stampLabel: design.stampLabel,
    rewardText: design.rewardText,
    offerTitle: design.offerTitle,
  }
}

export interface StampResult {
  pass: PassSummary
  completesCard: boolean
  /** Whether the change reached the phone. */
  walletSync: 'updated' | 'not_configured' | 'not_found' | 'error'
}

/**
 * The design a card is governed by: the published one where it exists, otherwise the draft
 * (which is the case while a location is still being set up).
 */
async function currentDesign(cardId: string): Promise<CardDesignInput> {
  const published = await loadPublishedDesign(cardId)
  if (published) return published
  return (await loadOrCreateDraft(cardId)).design
}

function toSummary(
  pass: {
    serial: string
    stamps: number
    stampGoal: number
    isTest: boolean
    rewardCount: number
    redeemedAt?: Date | null
  },
  lastStampAt: Date | null,
  labels: { stampLabel: string; rewardText: string; offerTitle: string | null },
): PassSummary {
  return {
    serial: pass.serial,
    stamps: pass.stamps,
    stampGoal: pass.stampGoal,
    isTest: pass.isTest,
    rewardCount: pass.rewardCount,
    lastStampAt: lastStampAt ? lastStampAt.toISOString() : null,
    redeemedAt: pass.redeemedAt ? pass.redeemedAt.toISOString() : null,
    ...labels,
  }
}

/** Reads a card without changing it — used to show the current state before stamping. */
export async function lookupPassAction(input: unknown): Promise<ActionResult<PassSummary>> {
  return guarded(async () => {
    const parsed = scanInputSchema.safeParse(input)
    if (!parsed.success) return fromZodError(parsed.error)

    await assertStampAccess(parsed.data.cardId)

    const serial = extractSerial(parsed.data.scanned)
    if (!serial) return fail('Dieser Code enthält keine gültige Kartennummer.', 'validation')

    const pass = await prisma.issuedPass.findFirst({
      where: { serial, cardId: parsed.data.cardId },
    })
    if (!pass) return fail(`Karte ${serial} gehört nicht zu dieser Stempelkarte.`, 'not_found')

    const last = await prisma.stampEvent.findFirst({
      where: { passId: pass.id, kind: 'STAMP' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    })

    return ok(toSummary(pass, last?.createdAt ?? null, toLabels(await currentDesign(parsed.data.cardId))))
  })
}

export async function stampAction(input: unknown): Promise<ActionResult<StampResult>> {
  return guarded(async () => {
    const parsed = scanInputSchema.safeParse(input)
    if (!parsed.success) return fromZodError(parsed.error)

    const { session, cardId } = await assertStampAccess(parsed.data.cardId)

    // A scanner pointed at a screen can fire continuously; cap the whole till, not just
    // the individual card.
    if (!rateLimit(`stamp:${cardId}`, 600, 60 * 60 * 1000).allowed) {
      return fail('Zu viele Buchungen in kurzer Zeit. Bitte kurz warten.', 'rate_limited')
    }

    const serial = extractSerial(parsed.data.scanned)
    if (!serial) return fail('Dieser Code enthält keine gültige Kartennummer.', 'validation')

    // The till hides the button for coupons, but the action is reachable on its own and a
    // stamped coupon would be a pass whose counter nothing ever displays.
    const card = await prisma.card.findFirst({ where: { id: cardId }, select: { kind: true } })
    if (card?.kind === 'COUPON') {
      return fail('Ein Gutschein wird eingelöst, nicht gestempelt.', 'validation')
    }

    const pass = await prisma.issuedPass.findFirst({ where: { serial, cardId } })
    if (!pass) return fail(`Karte ${serial} gehört nicht zu dieser Stempelkarte.`, 'not_found')

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
        return fail('Diese Karte ist voll. Bitte zuerst die Belohnung einlösen.', 'validation')
      }
      return fail(
        `Diese Karte wurde gerade eben gestempelt. Bitte in ${formatCooldown(decision.retryInMs)} erneut versuchen.`,
        'validation',
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
          cardId,
          kind: 'STAMP',
          delta: 1,
          balance: decision.nextBalance,
          stampedBy: session.userId,
        },
      })
      return next
    })

    const design = await currentDesign(cardId)
    const labels = toLabels(design)
    const sync = await syncGoogleStampCount(cardId, serial, updated.stamps, design)

    return ok({
      pass: toSummary(updated, new Date(), labels),
      completesCard: decision.completesCard,
      walletSync: sync.status,
    })
  })
}

export async function redeemAction(input: unknown): Promise<ActionResult<StampResult>> {
  return guarded(async () => {
    const parsed = scanInputSchema.safeParse(input)
    if (!parsed.success) return fromZodError(parsed.error)

    const { session, cardId } = await assertStampAccess(parsed.data.cardId)

    const serial = extractSerial(parsed.data.scanned)
    if (!serial) return fail('Dieser Code enthält keine gültige Kartennummer.', 'validation')

    const pass = await prisma.issuedPass.findFirst({ where: { serial, cardId } })
    if (!pass) return fail(`Karte ${serial} gehört nicht zu dieser Stempelkarte.`, 'not_found')

    const decision = decideRedeem({ stamps: pass.stamps, stampGoal: pass.stampGoal })
    if (!decision.ok) {
      return fail(
        `Die Karte ist noch nicht voll (${pass.stamps} von ${pass.stampGoal}).`,
        'validation',
      )
    }

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.issuedPass.update({
        where: { id: pass.id },
        data: {
          stamps: decision.nextBalance,
          rewardCount: { increment: 1 },
          lastRewardAt: new Date(),
        },
      })
      await tx.stampEvent.create({
        data: {
          passId: pass.id,
          cardId,
          kind: 'REDEEM',
          delta: -pass.stampGoal,
          balance: decision.nextBalance,
          stampedBy: session.userId,
        },
      })
      return next
    })

    const design = await currentDesign(cardId)
    const labels = toLabels(design)
    const sync = await syncGoogleStampCount(cardId, serial, updated.stamps, design)

    return ok({
      pass: toSummary(updated, null, labels),
      completesCard: false,
      walletSync: sync.status,
    })
  })
}

/**
 * Cashes in a coupon. Single-use, and the latch is the database, not the UI.
 *
 * A coupon is worth money, and the two ways to spend one twice are a double tap at the till
 * and the same code presented at two registers at once. Both are closed by the conditional
 * update below: only the request that finds `redeemedAt` still null gets to set it, so the
 * second one changes nothing and is told so.
 *
 * Google is told afterwards and on a best-effort basis — the pass being retired in the
 * customer's wallet is cosmetic. Our record is what decides whether it may be used again,
 * because the Offers API has no redemption flag to read back.
 */
export async function redeemCouponAction(input: unknown): Promise<ActionResult<PassSummary>> {
  return guarded(async () => {
    const parsed = scanInputSchema.safeParse(input)
    if (!parsed.success) return fromZodError(parsed.error)

    const { session, cardId } = await assertStampAccess(parsed.data.cardId)

    if (!rateLimit(`redeem:${cardId}`, 600, 60 * 60 * 1000).allowed) {
      return fail('Zu viele Buchungen in kurzer Zeit. Bitte kurz warten.', 'rate_limited')
    }

    const serial = extractSerial(parsed.data.scanned)
    if (!serial) return fail('Dieser Code enthält keine gültige Kartennummer.', 'validation')

    const card = await prisma.card.findFirst({ where: { id: cardId }, select: { kind: true } })
    if (card?.kind !== 'COUPON') {
      return fail('Diese Karte ist kein Gutschein.', 'validation')
    }

    const pass = await prisma.issuedPass.findFirst({ where: { serial, cardId } })
    if (!pass) return fail(`Gutschein ${serial} gehört nicht zu dieser Aktion.`, 'not_found')

    if (pass.redeemedAt) {
      return fail(
        `Dieser Gutschein wurde bereits am ${formatGermanDateTime(pass.redeemedAt)} eingelöst.`,
        'validation',
      )
    }

    const claimed = await prisma.issuedPass.updateMany({
      where: { id: pass.id, redeemedAt: null },
      data: { redeemedAt: new Date() },
    })
    if (claimed.count === 0) {
      return fail('Dieser Gutschein wurde gerade eben schon eingelöst.', 'validation')
    }

    await prisma.stampEvent.create({
      data: {
        passId: pass.id,
        cardId,
        kind: 'REDEEM',
        delta: 0,
        balance: 0,
        stampedBy: session.userId,
      },
    })

    // Cosmetic and allowed to fail: the coupon is already spent in our books.
    await expireGoogleOffer(serial)

    const updated = await prisma.issuedPass.findFirst({ where: { id: pass.id } })
    return ok(
      toSummary(updated ?? pass, null, toLabels(await currentDesign(cardId))),
    )
  })
}

function formatGermanDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} um ${pad(d.getHours())}:${pad(d.getMinutes())} Uhr`
}

/** Recent activity for the till view. */
export async function recentEventsAction(
  cardId: string,
): Promise<ActionResult<Array<{ id: string; serial: string; kind: string; balance: number; at: string }>>> {
  return guarded(async () => {
    await assertStampAccess(cardId)

    const events = await prisma.stampEvent.findMany({
      where: { cardId },
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: {
        id: true,
        kind: true,
        balance: true,
        createdAt: true,
        pass: { select: { serial: true } },
      },
    })

    return ok(
      events.map((e) => ({
        id: e.id,
        serial: e.pass.serial,
        kind: e.kind,
        balance: e.balance,
        at: e.createdAt.toISOString(),
      })),
    )
  })
}
