import 'server-only'
import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/db'
import { loadPassAssets } from './asset-service'
import { loadPublishedDesign } from './repository'
import { ensureAppleAuthToken } from '@/lib/pass/apple-passkit-auth'
import type { CardDesignInput, CardKind } from './schema'
import type { CardDesign } from '@/lib/pass/pass-builder'

/**
 * Handing a stamp card to an end customer at the counter.
 *
 * The NFC chip holds nothing but a URL — `/k/<nfcCode>` — so tapping it is the same event
 * as scanning the printed QR next to the till. Both land here, and both get the customer
 * their *own* pass: one `IssuedPass` row with its own serial, which is what the barcode
 * carries and what the till scans to book a stamp.
 *
 * Deliberately unauthenticated. The point is that a stranger's phone, with no app and no
 * account, is one tap away from a card in their wallet.
 *
 * Only *published* designs are handed out. A draft is work in progress; the customer's
 * wallet would keep whatever it was mid-edit.
 */

export const DEVICE_COOKIE = 'stampie_device'
export const DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export interface ResolvedHandout {
  cardId: string
  kind: CardKind
  organizationName: string
  design: CardDesignInput
  /** Stamps a freshly issued pass starts with. Always 0 for a coupon — it has no counter. */
  startStamps: number
}

/** Codes live on stickers and chips, so they are short enough to type but not guessable. */
export function newNfcCode(): string {
  return randomBytes(16).toString('base64url')
}

export function newDeviceKey(): string {
  return randomBytes(24).toString('base64url')
}

function newSerial(): string {
  return `K-${randomBytes(6).toString('hex').toUpperCase()}`
}

export async function resolveHandoutCode(code: string): Promise<ResolvedHandout | null> {
  if (!code || code.length < 10 || code.length > 128) return null

  const card = await prisma.card.findFirst({
    where: { nfcCode: code, archivedAt: null },
    select: {
      id: true,
      name: true,
      kind: true,
      handoutStartStamps: true,
      org: { select: { name: true } },
    },
  })
  if (!card) return null

  const design = await loadPublishedDesign(card.id)
  if (!design) return null

  return {
    cardId: card.id,
    kind: card.kind,
    organizationName: card.org?.name ?? card.name,
    design,
    // Capped against *this* design's goal, not stored capped — the goal can change after
    // the card has been live for a while, and the cap has to track that, not a snapshot.
    startStamps:
      card.kind === 'STAMP' ? Math.min(card.handoutStartStamps, design.stampGoal) : 0,
  }
}

/**
 * The pass for this phone: the one it already holds, or a new one.
 *
 * Reusing on `deviceKey` is what keeps a second tap from handing out a second card with
 * zero stamps — the customer would end up collecting on two cards without noticing which.
 * Test passes are excluded from the lookup so a card tried out from the dashboard is never
 * mistaken for the customer's real one.
 */
export async function findPassForDevice(
  resolved: ResolvedHandout,
  deviceKey: string,
): Promise<{ serial: string; currentStamps: number } | null> {
  const existing = await prisma.issuedPass.findFirst({
    where: { cardId: resolved.cardId, deviceKey, isTest: false, kind: resolved.kind },
    select: { serial: true, stamps: true },
    orderBy: { createdAt: 'desc' },
  })
  return existing ? { serial: existing.serial, currentStamps: existing.stamps } : null
}

export async function issuePassForDevice(
  resolved: ResolvedHandout,
  deviceKey: string,
): Promise<{ serial: string; currentStamps: number; created: boolean }> {
  const existing = await findPassForDevice(resolved, deviceKey)
  if (existing) return { ...existing, created: false }

  const pass = await prisma.issuedPass.create({
    data: {
      serial: newSerial(),
      cardId: resolved.cardId,
      kind: resolved.kind,
      deviceKey,
      stamps: resolved.startStamps,
      stampGoal: resolved.design.stampGoal,
      designVersion: 1,
    },
    select: { serial: true },
  })

  return { serial: pass.serial, currentStamps: resolved.startStamps, created: true }
}

/** Assembles what the PassBuilder needs, assets and update token included. */
export async function toHandoutDesign(
  resolved: ResolvedHandout,
  currentStamps: number,
  serial: string,
): Promise<CardDesign> {
  const [assets, appleAuthToken] = await Promise.all([
    loadPassAssets(resolved.design, resolved.cardId),
    ensureAppleAuthToken(serial),
  ])
  return {
    ...resolved.design,
    cardId: resolved.cardId,
    kind: resolved.kind,
    organizationName: resolved.organizationName,
    currentStamps,
    assets,
    appleAuthToken,
  }
}
