'use server'

import { z } from 'zod'
import { assertStampAccess, assertCardAccess } from '@/lib/auth/session'
import { fail, fromZodError, guarded, ok, type ActionResult } from '@/lib/action-result'
import { prisma } from '@/lib/db'
import { decideRedeem, decideStamp, extractSerial, formatCooldown } from '@/lib/cards/stamping'
import { syncGoogleStampCount } from '@/lib/wallet/google-sync'
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
}

function toLabels(design: CardDesignInput): { stampLabel: string; rewardText: string } {
  return { stampLabel: design.stampLabel, rewardText: design.rewardText }
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
  pass: { serial: string; stamps: number; stampGoal: number; isTest: boolean; rewardCount: number },
  lastStampAt: Date | null,
  labels: { stampLabel: string; rewardText: string },
): PassSummary {
  return {
    serial: pass.serial,
    stamps: pass.stamps,
    stampGoal: pass.stampGoal,
    isTest: pass.isTest,
    rewardCount: pass.rewardCount,
    lastStampAt: lastStampAt ? lastStampAt.toISOString() : null,
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
