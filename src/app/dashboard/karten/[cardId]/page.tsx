import { notFound } from 'next/navigation'
import { CardEditorShell } from './_components/card-editor-shell'
import { CardEditorProvider } from '@/stores/card-editor-provider'
import { assertCardAccess, LocationAccessError, UnauthorizedError } from '@/lib/auth/session'
import { prisma } from '@/lib/db'
import { loadOrCreateDraft } from '@/lib/cards/repository'
import { isPristineDesign } from '@/lib/cards/defaults'
import { getStorage, variantKey } from '@/lib/storage'
import type { LocationSummary, OpeningHours } from '@/types/location'

export const dynamic = 'force-dynamic'

/**
 * The card designer.
 *
 * Access is checked before any design data is touched, and a card the user cannot reach
 * produces a 404 rather than a 403 — a guessed id must not reveal whether it exists.
 *
 * The branch is optional: a card can be designed long before anyone decides which shop or
 * which address it belongs to, so the master data used for prefilling may simply be empty.
 */
export default async function KartePage({ params }: { params: Promise<{ cardId: string }> }) {
  const { cardId } = await params

  let access
  try {
    access = await assertCardAccess(cardId)
  } catch (e) {
    if (e instanceof LocationAccessError || e instanceof UnauthorizedError) notFound()
    throw e
  }

  const [card, draft] = await Promise.all([
    prisma.card.findFirst({
      where: { id: access.cardId },
      include: {
        org: { select: { name: true } },
        location: true,
      },
    }),
    loadOrCreateDraft(access.cardId),
  ])

  if (!card) notFound()

  const branch = card.location
  const location: LocationSummary = {
    id: branch?.id ?? card.id,
    name: branch?.name ?? card.name,
    organizationName: card.org?.name ?? card.name,
    street: branch?.street ?? null,
    postalCode: branch?.postalCode ?? null,
    city: branch?.city ?? null,
    phone: branch?.phone ?? null,
    website: branch?.website ?? null,
    email: branch?.email ?? null,
    imprintUrl: branch?.imprintUrl ?? null,
    privacyUrl: branch?.privacyUrl ?? null,
    latitude: branch?.latitude ?? null,
    longitude: branch?.longitude ?? null,
    openingHours: Array.isArray(branch?.openingHours)
      ? (branch.openingHours as unknown as OpeningHours[])
      : [],
  }

  // The client cannot derive a storage URL from an asset id, so seed the map here.
  const assets = await prisma.asset.findMany({
    where: { cardId: access.cardId },
    select: { id: true, storageKey: true },
  })
  const storage = await getStorage()
  const assetUrls = Object.fromEntries(
    assets.map((a) => [a.id, storage.publicUrl(variantKey(a.storageKey, 1))]),
  )

  return (
    <CardEditorProvider init={{ cardId: card.id, kind: card.kind, design: draft.design, assetUrls }}>
      <CardEditorShell
        cardName={card.name}
        location={location}
        userEmail={access.session.email}
        publishedVersion={draft.publishedVersion}
        // Templates carry stamp goals and icons, so they only make sense for a stamp card.
        suggestTemplate={
          card.kind === 'STAMP' &&
          draft.publishedVersion === null &&
          isPristineDesign(draft.design)
        }
        canStamp={access.canStamp}
      />
    </CardEditorProvider>
  )
}
