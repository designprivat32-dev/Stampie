import 'server-only'
import { prisma } from '@/lib/db'
import { isAdminSession } from '@/lib/auth/session'
import { newFieldId } from './defaults'
import { geoLocationSchema, type CardKind, type GeoLocation } from './schema'

/**
 * Reads around the `Card` aggregate.
 *
 * A card is what the agency creates, designs and hands to a customer. It owns its design,
 * its assets and its issued passes — the customer's organisation only says *who* it
 * belongs to, and therefore who may stamp it.
 */

export interface CardSummary {
  id: string
  name: string
  orgId: string | null
  orgName: string | null
  createdAt: string
  isPublished: boolean
  publishedVersion: number | null
  /** Cards actually handed to customers. */
  issuedCount: number
  /** Test cards generated from the designer — counted apart so they never inflate the above. */
  testCount: number
  /** The location alert, as far as the overview needs to draw a switch for it. */
  geoNotifications: {
    enabled: boolean
    locationCount: number
    /**
     * False only where switching on would produce an alert around nothing: no location on
     * the card and no coordinates in the customer's master data to seed one from.
     */
    canEnable: boolean
  }
  /** Enough of the design to draw a preview tile. */
  preview: {
    backgroundColor: string
    foregroundColor: string
    labelColor: string
    programName: string
    stampGoal: number
    stampIcon: string
    emptyStampStyle: string
    stampIconAssetId: string | null
    heroAssetId: string | null
  } | null
}

/**
 * What the card issues. Every consumer of a design needs it — the publish gate, the pass
 * builders and the editor all branch on it — so it is read from the card, never inferred
 * from whether coupon fields happen to be filled in.
 */
export async function cardKind(cardId: string): Promise<CardKind> {
  const card = await prisma.card.findFirst({ where: { id: cardId }, select: { kind: true } })
  return card?.kind ?? 'STAMP'
}

/** The name shown as the pass issuer. Falls back sensibly for unassigned cards. */
export async function issuerName(cardId: string): Promise<string> {
  const card = await prisma.card.findFirst({
    where: { id: cardId },
    select: { name: true, org: { select: { name: true } } },
  })
  return card?.org?.name ?? card?.name ?? 'Stampie'
}

export interface ListCardsOptions {
  /** Null means "every card", which only agency members are allowed to ask for. */
  orgIds: string[] | null
}

export async function listCards(options: ListCardsOptions): Promise<CardSummary[]> {
  const rows = await prisma.card.findMany({
    where: {
      ...(options.orgIds ? { orgId: { in: options.orgIds } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      orgId: true,
      createdAt: true,
      org: { select: { name: true, latitude: true, longitude: true } },
      designs: {
        select: {
          status: true,
          version: true,
          geoNotificationsEnabled: true,
          geoLocations: true,
          backgroundColor: true,
          foregroundColor: true,
          labelColor: true,
          programName: true,
          stampGoal: true,
          stampIcon: true,
          emptyStampStyle: true,
          stampIconAssetId: true,
          heroAssetId: true,
        },
      },
    },
  })

  // Test cards would inflate "cards in circulation", which is the number a shop owner
  // reads as "how many customers do I have" — so they are counted separately, not hidden.
  const counts = await prisma.issuedPass.groupBy({
    by: ['cardId', 'isTest'],
    where: { cardId: { in: rows.map((r) => r.id) } },
    _count: { _all: true },
  })
  const issuedByCard = new Map<string, number>()
  const testByCard = new Map<string, number>()
  for (const row of counts) {
    const target = row.isTest ? testByCard : issuedByCard
    target.set(row.cardId, (target.get(row.cardId) ?? 0) + row._count._all)
  }

  return rows.map((row) => {
    const published = row.designs.find((d) => d.status === 'PUBLISHED')
    // The tile shows what the customer would get: published where it exists, else draft.
    const source = published ?? row.designs.find((d) => d.status === 'DRAFT') ?? null
    const locationCount = countGeoLocations(source?.geoLocations)
    const hasOrgCoordinates =
      row.org !== null && row.org.latitude !== null && row.org.longitude !== null

    return {
      id: row.id,
      name: row.name,
      orgId: row.orgId,
      orgName: row.org?.name ?? null,
      createdAt: row.createdAt.toISOString(),
      isPublished: published !== undefined,
      publishedVersion: published?.version ?? null,
      issuedCount: issuedByCard.get(row.id) ?? 0,
      testCount: testByCard.get(row.id) ?? 0,
      geoNotifications: {
        // Read from the same row as the preview: the published design where there is one,
        // because that is what the cards in circulation actually follow.
        enabled: source?.geoNotificationsEnabled ?? false,
        locationCount,
        canEnable: locationCount > 0 || hasOrgCoordinates,
      },
      preview: source
        ? {
            backgroundColor: source.backgroundColor,
            foregroundColor: source.foregroundColor,
            labelColor: source.labelColor,
            programName: source.programName,
            stampGoal: source.stampGoal,
            stampIcon: source.stampIcon,
            emptyStampStyle: source.emptyStampStyle,
            stampIconAssetId: source.stampIconAssetId,
            heroAssetId: source.heroAssetId,
          }
        : null,
    }
  })
}

function countGeoLocations(value: unknown): number {
  const parsed = geoLocationSchema.array().safeParse(value)
  return parsed.success ? parsed.data.length : 0
}

/**
 * The location the overview's switch seeds the first entry with: the shop itself.
 *
 * Null where the customer's master data has no coordinates — the designer may fall back to
 * a pin someone can drag, a switch in a list cannot: nobody would see where it landed.
 */
export async function organizationGeoSeed(cardId: string): Promise<GeoLocation | null> {
  const card = await prisma.card.findFirst({
    where: { id: cardId },
    select: { name: true, org: { select: { name: true, latitude: true, longitude: true } } },
  })
  const org = card?.org
  if (!org || org.latitude === null || org.longitude === null) return null

  return {
    id: newFieldId(),
    label: org.name,
    latitude: org.latitude,
    longitude: org.longitude,
    maxDistance: 150,
    relevantText: 'Deine Stempelkarte ist bereit',
  }
}

export interface CustomerOption {
  id: string
  name: string
}

/** Organisations a card can be assigned to. */
export async function listCustomers(orgIds: string[] | null): Promise<CustomerOption[]> {
  const rows = await prisma.organization.findMany({
    where: orgIds ? { id: { in: orgIds } } : {},
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  })
  return rows
}

/**
 * Organisations the user may see, or null for "no restriction".
 *
 * Null for the dashboard operator (see `isAdminSession`) — otherwise a card handed to a
 * customer would disappear from the very overview it was handed out in. Customer logins
 * never reach this function; the app API scopes itself by `orgId`.
 */
export async function accessibleOrgIds(userId: string): Promise<string[] | null> {
  if (await isAdminSession(userId)) return null

  const memberships = await prisma.membership.findMany({
    where: { userId },
    select: { orgId: true },
  })
  return memberships.map((m) => m.orgId)
}
