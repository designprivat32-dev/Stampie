import 'server-only'
import { prisma } from '@/lib/db'

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
  locationName: string | null
  createdAt: string
  archivedAt: string | null
  isPublished: boolean
  publishedVersion: number | null
  /** Cards actually handed to customers. */
  issuedCount: number
  /** Test cards generated from the designer — counted apart so they never inflate the above. */
  testCount: number
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

/** The name shown as the pass issuer. Falls back sensibly for unassigned cards. */
export async function issuerName(cardId: string): Promise<string> {
  const card = await prisma.card.findFirst({
    where: { id: cardId },
    select: { name: true, org: { select: { name: true } } },
  })
  return card?.org?.name ?? card?.name ?? 'Stemply'
}

export interface ListCardsOptions {
  /** Null means "every card", which only agency members are allowed to ask for. */
  orgIds: string[] | null
  includeArchived?: boolean
}

export async function listCards(options: ListCardsOptions): Promise<CardSummary[]> {
  const rows = await prisma.card.findMany({
    where: {
      ...(options.orgIds ? { orgId: { in: options.orgIds } } : {}),
      ...(options.includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      orgId: true,
      createdAt: true,
      archivedAt: true,
      org: { select: { name: true } },
      location: { select: { name: true } },
      designs: {
        select: {
          status: true,
          version: true,
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

    return {
      id: row.id,
      name: row.name,
      orgId: row.orgId,
      orgName: row.org?.name ?? null,
      locationName: row.location?.name ?? null,
      createdAt: row.createdAt.toISOString(),
      archivedAt: row.archivedAt?.toISOString() ?? null,
      isPublished: published !== undefined,
      publishedVersion: published?.version ?? null,
      issuedCount: issuedByCard.get(row.id) ?? 0,
      testCount: testByCard.get(row.id) ?? 0,
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

export interface CustomerOption {
  id: string
  name: string
  locations: Array<{ id: string; name: string }>
}

/** Organisations a card can be assigned to. */
export async function listCustomers(orgIds: string[] | null): Promise<CustomerOption[]> {
  const rows = await prisma.organization.findMany({
    where: orgIds ? { id: { in: orgIds } } : {},
    orderBy: { name: 'asc' },
    select: { id: true, name: true, locations: { select: { id: true, name: true } } },
  })
  return rows
}

/** Organisations the user belongs to; null for agency members, who see everything. */
export async function accessibleOrgIds(userId: string): Promise<string[] | null> {
  const memberships = await prisma.membership.findMany({
    where: { userId },
    select: { orgId: true, role: true },
  })
  if (memberships.some((m) => m.role === 'AGENCY')) return null
  return memberships.map((m) => m.orgId)
}
