import 'server-only'
import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/db'
import { loadPassAssets } from './asset-service'
import { loadPublishedDesign } from './repository'
import { ensureAppleAuthToken } from '@/lib/pass/apple-passkit-auth'
import { consentRecord } from '@/lib/privacy/consent'
import type { CardDesignInput, CardKind } from './schema'
import type { OpeningHours } from '@/types/customer'
import type { CardDesign } from '@/lib/pass/pass-builder'

/**
 * Handing a stamp card to an end customer at the counter.
 *
 * The NFC chip holds nothing but a URL — `/k/<nfcCode>` — so tapping it is the same event
 * as scanning the printed QR next to the till. Both land here, and both get the customer
 * their *own* pass: one `IssuedPass` row with its own serial, which is what the barcode
 * carries and what the till scans to book a stamp. Every scan hands out a new, empty card;
 * the phone is not recognised across visits.
 *
 * Deliberately unauthenticated. The point is that a stranger's phone, with no app and no
 * account, is one tap away from a card in their wallet.
 *
 * Only *published* designs are handed out. A draft is work in progress; the customer's
 * wallet would keep whatever it was mid-edit.
 */

export interface ResolvedHandout {
  cardId: string
  kind: CardKind
  organizationName: string
  design: CardDesignInput
  /** Stamps a freshly issued pass starts with. Always 0 for a coupon — it has no counter. */
  startStamps: number
  /** Free text the shop writes for this card, shown above the buttons. */
  greeting: string | null
  /**
   * The shop's own details, so the page reads as theirs. Every field is optional: a
   * customer can exist before the agency has captured any of it, and a missing line is
   * simply left out rather than shown empty.
   */
  customer: {
    street: string | null
    postalCode: string | null
    city: string | null
    phone: string | null
    /** Nur für die Datenschutzinformation: an wen sich der Endkunde wenden kann. */
    email: string | null
    website: string | null
    openingHours: OpeningHours[]
  }
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
    where: { nfcCode: code },
    select: {
      id: true,
      name: true,
      kind: true,
      handoutStartStamps: true,
      handoutGreeting: true,
      org: {
        select: {
          name: true,
          street: true,
          postalCode: true,
          city: true,
          phone: true,
          email: true,
          website: true,
          openingHours: true,
        },
      },
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
    greeting: card.handoutGreeting?.trim() || null,
    customer: {
      street: card.org?.street ?? null,
      postalCode: card.org?.postalCode ?? null,
      city: card.org?.city ?? null,
      phone: card.org?.phone ?? null,
      email: card.org?.email ?? null,
      website: card.org?.website ?? null,
      openingHours: Array.isArray(card.org?.openingHours)
        ? (card.org.openingHours as unknown as OpeningHours[])
        : [],
    },
  }
}

/**
 * The pass belonging to a `deviceKey`, if there is one.
 *
 * Nothing is stored on the phone any more — each handout mints its own key — so in the
 * handout flow this only guards against creating two rows for the same key. Test passes
 * are excluded from the lookup so a card tried out from the dashboard is never mistaken
 * for a customer's real one.
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
  /** Hat der Kunde auf der Ausgabeseite in Werbenachrichten eingewilligt? */
  marketingConsent = false,
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
      // Ohne Häkchen bleiben beide Felder null — und null heißt überall "keine Werbung".
      ...(marketingConsent ? consentRecord() : {}),
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
