import 'server-only'
import { randomBytes } from 'node:crypto'
import QRCode from 'qrcode'
import { prisma } from '@/lib/db'
import { appUrl } from '@/lib/app-url'
import { loadOrCreateDraft, loadPublishedDesign } from './repository'
import { loadPassAssets } from './asset-service'
import type { CardDesignInput } from './schema'
import type { CardDesign } from '@/lib/pass/pass-builder'

/**
 * The coupon a full stamp card hands out.
 *
 * A wallet pass cannot change its type, so the stamp card is not transformed — a second,
 * separate pass is issued and the stamp card carries on counting from zero. Both hang off
 * the same `Card`, which is why `IssuedPass.kind` exists: the card is a STAMP programme,
 * but some of its passes are coupons.
 *
 * The Google class is `reward_<cardId>`, deliberately not the card's own `card_<cardId>` —
 * that id already names a loyaltyClass, and reusing it across two resource types is a
 * collision waiting to be debugged at a counter.
 */

export const REWARD_COUPON_CLASS_PREFIX = 'reward_'

/** Serial for a reward coupon. Distinct prefix so staff can tell the two apart on sight. */
function newCouponSerial(): string {
  return `G-${randomBytes(6).toString('hex').toUpperCase()}`
}

export interface IssuedRewardCoupon {
  serial: string
  /** Public URL the customer opens to put the coupon in their wallet. */
  claimUrl: string
  /**
   * The same URL as a scannable code. The customer is standing at the counter with their
   * phone out — a QR on the till screen is the shortest path from "card full" to "coupon
   * in wallet", and it needs no e-mail address or app.
   */
  qrDataUrl: string
}

/** True when the design actually describes a coupon worth issuing. */
export function offersRewardCoupon(design: CardDesignInput): boolean {
  return design.rewardCouponEnabled && Boolean(design.offerTitle?.trim())
}

/**
 * Issues one coupon for a redeemed card.
 *
 * Returns null when the design does not offer one, so callers can treat "no coupon" as a
 * normal outcome rather than an error — most stamp cards will never switch this on.
 */
export async function issueRewardCoupon(
  cardId: string,
  design: CardDesignInput,
  options: { isTest: boolean },
): Promise<IssuedRewardCoupon | null> {
  if (!offersRewardCoupon(design)) return null

  const claimToken = randomBytes(32).toString('base64url')
  const pass = await prisma.issuedPass.create({
    data: {
      serial: newCouponSerial(),
      cardId,
      kind: 'COUPON',
      // A coupon issued from a test card must not look like a real one at the till.
      isTest: options.isTest,
      stamps: 0,
      stampGoal: 0,
      designVersion: 1,
      claimToken,
    },
    select: { serial: true },
  })

  const claimUrl = `${appUrl()}/g/${claimToken}`
  const qrDataUrl = await QRCode.toDataURL(claimUrl, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 512,
    color: { dark: '#18181bff', light: '#ffffffff' },
  })

  return { serial: pass.serial, claimUrl, qrDataUrl }
}

export interface ResolvedRewardCoupon {
  cardId: string
  serial: string
  design: CardDesignInput
  organizationName: string
  redeemed: boolean
}

/**
 * Resolves a claim link. The token is the only credential — it is single-purpose, random
 * and never printed on the pass, unlike the serial.
 */
export async function resolveClaimToken(token: string): Promise<ResolvedRewardCoupon | null> {
  if (!token || token.length < 10 || token.length > 128) return null

  const pass = await prisma.issuedPass.findFirst({
    where: { claimToken: token, kind: 'COUPON' },
    select: {
      cardId: true,
      serial: true,
      redeemedAt: true,
      card: { select: { name: true, org: { select: { name: true } } } },
    },
  })
  if (!pass) return null

  const published = await loadPublishedDesign(pass.cardId)
  const design = published ?? (await loadOrCreateDraft(pass.cardId)).design

  return {
    cardId: pass.cardId,
    serial: pass.serial,
    design,
    organizationName: pass.card.org?.name ?? pass.card.name,
    redeemed: pass.redeemedAt !== null,
  }
}

/** Assembles what the pass builders need for a reward coupon. */
export async function toCouponPassDesign(resolved: ResolvedRewardCoupon): Promise<CardDesign> {
  const assets = await loadPassAssets(resolved.design, resolved.cardId)
  return {
    ...resolved.design,
    cardId: resolved.cardId,
    kind: 'COUPON',
    classSuffix: `${REWARD_COUPON_CLASS_PREFIX}${resolved.cardId}`,
    redeemed: resolved.redeemed,
    organizationName: resolved.organizationName,
    currentStamps: 0,
    assets,
  }
}
