import 'server-only'
import type { CardDesign as CardDesignRow, Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { DEFAULT_CARD_DESIGN } from './defaults'
import { z } from 'zod'
import { cardDesignDraftSchema, geoLocationSchema, type CardDesignInput, type GeoLocation } from './schema'

/**
 * Data access for card designs.
 *
 * Two rows per card: one DRAFT (what the editor writes to) and one PUBLISHED (what issued
 * passes render from). Every query filters by `cardId`; nothing here takes a bare design
 * id, so a design can never be reached without going through the card's access check.
 */

export function rowToDesign(row: CardDesignRow): CardDesignInput {
  // The JSON columns are validated on the way in, but a row written by an older version
  // of the schema must not crash the editor — fall back to the defaults instead.
  const parsed = cardDesignDraftSchema.safeParse({
    backgroundColor: row.backgroundColor,
    foregroundColor: row.foregroundColor,
    labelColor: row.labelColor,
    logoAssetId: row.logoAssetId,
    squareLogoAssetId: row.squareLogoAssetId,
    iconAssetId: row.iconAssetId,
    heroAssetId: row.heroAssetId,
    stampGoal: row.stampGoal,
    stampIcon: row.stampIcon,
    stampIconAssetId: row.stampIconAssetId,
    emptyStampStyle: row.emptyStampStyle,
    rewardText: row.rewardText,
    programName: row.programName,
    cardTitle: row.cardTitle,
    issuerDisplayName: row.issuerDisplayName,
    stampLabel: row.stampLabel,
    backFields: row.backFields,
    rewardCouponEnabled: row.rewardCouponEnabled,
    offerTitle: row.offerTitle,
    offerDetails: row.offerDetails,
    offerFinePrint: row.offerFinePrint,
    redemptionChannel: row.redemptionChannel,
    accountNameLabel: row.accountNameLabel,
    accountIdLabel: row.accountIdLabel,
    rewardsTierLabel: row.rewardsTierLabel,
    rewardsTier: row.rewardsTier,
    googleAccountNameEnabled: row.googleAccountNameEnabled,
    googleRewardsTierEnabled: row.googleRewardsTierEnabled,
    barcodeFormat: row.barcodeFormat,
    geoNotificationsEnabled: row.geoNotificationsEnabled,
    geoLocations: row.geoLocations,
    expiresAt: row.expiresAt,
    shareable: row.shareable,
  })

  return parsed.success ? parsed.data : { ...DEFAULT_CARD_DESIGN }
}

/** The concrete column values, usable for both `create` and `update`. */
export type CardDesignRowData = Omit<
  Prisma.CardDesignUncheckedCreateInput,
  'id' | 'cardId' | 'status' | 'version' | 'createdAt' | 'updatedAt' | 'versions'
>

export function designToRow(design: CardDesignInput): CardDesignRowData {
  return {
    backgroundColor: design.backgroundColor,
    foregroundColor: design.foregroundColor,
    labelColor: design.labelColor,
    logoAssetId: design.logoAssetId,
    squareLogoAssetId: design.squareLogoAssetId,
    iconAssetId: design.iconAssetId,
    heroAssetId: design.heroAssetId,
    stampGoal: design.stampGoal,
    stampIcon: design.stampIcon,
    stampIconAssetId: design.stampIconAssetId,
    emptyStampStyle: design.emptyStampStyle,
    rewardText: design.rewardText,
    programName: design.programName,
    cardTitle: design.cardTitle,
    issuerDisplayName: design.issuerDisplayName,
    stampLabel: design.stampLabel,
    backFields: design.backFields as unknown as Prisma.InputJsonValue,
    rewardCouponEnabled: design.rewardCouponEnabled,
    offerTitle: design.offerTitle,
    offerDetails: design.offerDetails,
    offerFinePrint: design.offerFinePrint,
    redemptionChannel: design.redemptionChannel,
    accountNameLabel: design.accountNameLabel,
    accountIdLabel: design.accountIdLabel,
    rewardsTierLabel: design.rewardsTierLabel,
    rewardsTier: design.rewardsTier,
    googleAccountNameEnabled: design.googleAccountNameEnabled,
    googleRewardsTierEnabled: design.googleRewardsTierEnabled,
    barcodeFormat: design.barcodeFormat,
    geoNotificationsEnabled: design.geoNotificationsEnabled,
    geoLocations: design.geoLocations as unknown as Prisma.InputJsonValue,
    expiresAt: design.expiresAt,
    shareable: design.shareable,
  }
}

export interface LoadedDesign {
  id: string
  design: CardDesignInput
  version: number
  updatedAt: Date
  hasPublished: boolean
  publishedVersion: number | null
}

/** Returns the draft, creating it from the defaults on first visit. */
export async function loadOrCreateDraft(cardId: string): Promise<LoadedDesign> {
  const existing = await prisma.cardDesign.findFirst({
    where: { cardId, status: 'DRAFT' },
  })

  const row =
    existing ??
    (await prisma.cardDesign.create({
      data: { cardId, status: 'DRAFT', ...designToRow(DEFAULT_CARD_DESIGN) },
    }))

  const published = await prisma.cardDesign.findFirst({
    where: { cardId, status: 'PUBLISHED' },
    select: { version: true },
  })

  return {
    id: row.id,
    design: rowToDesign(row),
    version: row.version,
    updatedAt: row.updatedAt,
    hasPublished: published !== null,
    publishedVersion: published?.version ?? null,
  }
}

export async function saveDraft(cardId: string, design: CardDesignInput): Promise<LoadedDesign> {
  const draft = await prisma.cardDesign.findFirst({
    where: { cardId, status: 'DRAFT' },
    select: { id: true },
  })

  const row = draft
    ? await prisma.cardDesign.update({ where: { id: draft.id }, data: designToRow(design) })
    : await prisma.cardDesign.create({
        data: { cardId, status: 'DRAFT', ...designToRow(design) },
      })

  const published = await prisma.cardDesign.findFirst({
    where: { cardId, status: 'PUBLISHED' },
    select: { version: true },
  })

  return {
    id: row.id,
    design: rowToDesign(row),
    version: row.version,
    updatedAt: row.updatedAt,
    hasPublished: published !== null,
    publishedVersion: published?.version ?? null,
  }
}

export async function countAffectedPasses(cardId: string): Promise<number> {
  return prisma.issuedPass.count({ where: { cardId, isTest: false } })
}

export interface PublishResult {
  version: number
  affectedPasses: number
  publishedAt: Date
}

/**
 * Copies the draft onto the published row, bumps the version and snapshots it.
 * One transaction — a half-published card would be visible to every existing holder.
 */
export async function publishDesign(
  cardId: string,
  design: CardDesignInput,
  publishedBy: string,
  options: { contrastOverride: boolean; note?: string },
): Promise<PublishResult> {
  const affectedPasses = await countAffectedPasses(cardId)

  return prisma.$transaction(async (tx) => {
    const currentPublished = await tx.cardDesign.findFirst({
      where: { cardId, status: 'PUBLISHED' },
      select: { id: true, version: true },
    })

    const nextVersion = (currentPublished?.version ?? 0) + 1
    const rowData = designToRow(design)
    const audit = options.contrastOverride
      ? { contrastOverrideBy: publishedBy, contrastOverrideAt: new Date() }
      : { contrastOverrideBy: null, contrastOverrideAt: null }

    const published = currentPublished
      ? await tx.cardDesign.update({
          where: { id: currentPublished.id },
          data: { ...rowData, ...audit, version: nextVersion },
        })
      : await tx.cardDesign.create({
          data: { ...rowData, ...audit, cardId, status: 'PUBLISHED', version: nextVersion },
        })

    await tx.cardDesignVersion.create({
      data: {
        designId: published.id,
        cardId,
        version: nextVersion,
        snapshot: design as unknown as Prisma.InputJsonValue,
        publishedBy,
        note: options.note ?? null,
      },
    })

    // Keep the draft's version counter in step so the UI can show "Entwurf zu v3".
    await tx.cardDesign.updateMany({
      where: { cardId, status: 'DRAFT' },
      data: { version: nextVersion },
    })

    return { version: nextVersion, affectedPasses, publishedAt: new Date() }
  })
}

export interface VersionSummary {
  id: string
  version: number
  publishedAt: Date
  publishedBy: string
  note: string | null
}

export async function listVersions(cardId: string, take = 25): Promise<VersionSummary[]> {
  const rows = await prisma.cardDesignVersion.findMany({
    where: { cardId },
    orderBy: { publishedAt: 'desc' },
    take,
    select: { id: true, version: true, publishedAt: true, publishedBy: true, note: true },
  })
  return rows
}

/** Loads a version snapshot, scoped to the tenant. */
export async function loadVersionSnapshot(
  cardId: string,
  versionId: string,
): Promise<CardDesignInput | null> {
  const row = await prisma.cardDesignVersion.findFirst({
    where: { id: versionId, cardId },
    select: { snapshot: true },
  })
  if (!row) return null
  const parsed = cardDesignDraftSchema.safeParse(row.snapshot)
  return parsed.success ? parsed.data : null
}

export interface GeoNotificationUpdate {
  enabled: boolean
  /** Seeds the first location on rows that have none — the shop's own coordinates. */
  seedLocation: GeoLocation | null
}

/**
 * Flips the location alert on the draft *and* the published design in one go.
 *
 * Deliberately no new version. The switch decides whether an already published design's
 * locations are delivered; it changes nothing about how the card looks, and a version
 * counter that ticks every time a shop switches the alert off over the winter tells the
 * next reader nothing. Both rows move together so the designer does not show "aus" on a
 * card that is still alerting.
 *
 * Returns the published design as it now stands — that is what has to reach the wallets —
 * or null for a card that was never published, where there is nothing to push.
 */
export async function setGeoNotifications(
  cardId: string,
  update: GeoNotificationUpdate,
): Promise<CardDesignInput | null> {
  const rows = await prisma.cardDesign.findMany({
    where: { cardId },
    select: { id: true, geoLocations: true },
  })

  await prisma.$transaction(
    rows.map((row) => {
      const current = parseGeoLocations(row.geoLocations)
      const geoLocations =
        update.seedLocation && current.length === 0 ? [update.seedLocation] : current

      return prisma.cardDesign.update({
        where: { id: row.id },
        data: {
          geoNotificationsEnabled: update.enabled,
          geoLocations: geoLocations as unknown as Prisma.InputJsonValue,
        },
      })
    }),
  )

  return loadPublishedDesign(cardId)
}

/**
 * How many locations the card carries, taken across both design rows.
 *
 * The switch in the overview asks before it writes: switching the alert on for a card that
 * has no location anywhere would be an alert around nothing.
 */
export async function geoLocationCount(cardId: string): Promise<number> {
  const rows = await prisma.cardDesign.findMany({
    where: { cardId },
    select: { geoLocations: true },
  })
  return rows.reduce((max, row) => Math.max(max, parseGeoLocations(row.geoLocations).length), 0)
}

/** A JSON column written by an older schema must not throw — it reads as "no locations". */
function parseGeoLocations(value: unknown): GeoLocation[] {
  const parsed = z.array(geoLocationSchema).safeParse(value)
  return parsed.success ? parsed.data : []
}

export async function loadPublishedDesign(cardId: string): Promise<CardDesignInput | null> {
  const row = await prisma.cardDesign.findFirst({ where: { cardId, status: 'PUBLISHED' } })
  return row ? rowToDesign(row) : null
}
