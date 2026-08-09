import 'server-only'
import { prisma } from '@/lib/db'
import { cardDesignDraftSchema, type CardDesignInput, type CardKind } from './schema'
import { loadPassAssets } from './asset-service'
import type { CardDesign } from '@/lib/pass/pass-builder'

/**
 * Shared resolution of a public test-card token. Used by both the landing page and the
 * download route, so the expiry/usage rules exist in exactly one place.
 */

export interface ResolvedTestCard {
  cardId: string
  kind: CardKind
  organizationName: string
  design: CardDesignInput
  currentStamps: number
  serial: string
}

const MAX_USES = 20

export async function resolveTestCardToken(token: string): Promise<ResolvedTestCard | null> {
  if (!token || token.length < 10 || token.length > 128) return null

  const record = await prisma.testCardToken.findFirst({
    where: { token, expiresAt: { gt: new Date() } },
    select: {
      id: true,
      cardId: true,
      snapshot: true,
      usedCount: true,
      card: { select: { name: true, kind: true, org: { select: { name: true } } } },
    },
  })
  if (!record || record.usedCount >= MAX_USES) return null

  const snapshot = record.snapshot as { design?: unknown; currentStamps?: number } | null
  const parsed = cardDesignDraftSchema.safeParse(snapshot?.design)
  if (!parsed.success) return null

  return {
    cardId: record.cardId,
    kind: record.card.kind,
    organizationName: record.card.org?.name ?? record.card.name,
    design: parsed.data,
    currentStamps: Math.min(parsed.data.stampGoal, snapshot?.currentStamps ?? 0),
    serial: `TEST-${record.id.slice(-8).toUpperCase()}`,
  }
}

/**
 * Registers the test card as a real issued pass.
 *
 * Without this the barcode points at a serial nothing knows about, and scanning it in the
 * till view fails — the demo would break at exactly the step it is meant to show.
 */
export async function ensureIssuedPass(resolved: ResolvedTestCard): Promise<void> {
  await prisma.issuedPass.upsert({
    where: { serial: resolved.serial },
    create: {
      serial: resolved.serial,
      cardId: resolved.cardId,
      isTest: true,
      stamps: resolved.currentStamps,
      stampGoal: resolved.design.stampGoal,
      designVersion: 1,
    },
    // Re-downloading the same test card must not reset a counter that was stamped since.
    update: {},
  })
}

export async function noteTokenUse(token: string): Promise<void> {
  await prisma.testCardToken.updateMany({
    where: { token },
    data: { usedCount: { increment: 1 } },
  })
}

/** Assembles the full CardDesign the PassBuilder expects, assets included. */
export async function toPassDesign(resolved: ResolvedTestCard): Promise<CardDesign> {
  const assets = await loadPassAssets(resolved.design, resolved.cardId)
  return {
    ...resolved.design,
    cardId: resolved.cardId,
    kind: resolved.kind,
    organizationName: resolved.organizationName,
    currentStamps: resolved.currentStamps,
    assets,
  }
}

export type MobilePlatform = 'apple' | 'google' | 'unknown'

/** Coarse on purpose: we only need iOS vs Android, and only to pick a default. */
export function detectPlatform(userAgent: string | null): MobilePlatform {
  if (!userAgent) return 'unknown'
  const ua = userAgent.toLowerCase()
  if (/iphone|ipad|ipod/.test(ua)) return 'apple'
  // iPadOS 13+ reports as Macintosh; a Mac cannot install a pass either way, so both
  // land on the chooser rather than being guessed wrong.
  if (/android/.test(ua)) return 'google'
  return 'unknown'
}
