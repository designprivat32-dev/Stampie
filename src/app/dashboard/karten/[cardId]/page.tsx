import { notFound } from 'next/navigation'
import { CardEditorShell } from './_components/card-editor-shell'
import { CardEditorProvider } from '@/stores/card-editor-provider'
import { assertCardAccess, CardAccessError, UnauthorizedError } from '@/lib/auth/session'
import { prisma } from '@/lib/db'
import { loadOrCreateDraft } from '@/lib/cards/repository'
import { isPristineDesign } from '@/lib/cards/defaults'
import { getStorage, variantKey } from '@/lib/storage'
import type { CustomerSummary, OpeningHours } from '@/types/customer'

export const dynamic = 'force-dynamic'

/**
 * The card designer.
 *
 * Access is checked before any design data is touched, and a card the user cannot reach
 * produces a 404 rather than a 403 — a guessed id must not reveal whether it exists.
 *
 * The customer is optional: a card can be designed long before anyone decides who gets it,
 * so the master data used for prefilling may simply be empty.
 */
export default async function KartePage({ params }: { params: Promise<{ cardId: string }> }) {
  const { cardId } = await params

  let access
  try {
    access = await assertCardAccess(cardId)
  } catch (e) {
    if (e instanceof CardAccessError || e instanceof UnauthorizedError) notFound()
    throw e
  }

  const [card, draft] = await Promise.all([
    prisma.card.findFirst({
      where: { id: access.cardId },
      include: { org: true },
    }),
    loadOrCreateDraft(access.cardId),
  ])

  if (!card) notFound()

  const org = card.org
  const customer: CustomerSummary = {
    id: org?.id ?? null,
    // Falls back to the card's own name so the header is never blank on an unassigned card.
    name: org?.name ?? card.name,
    street: org?.street ?? null,
    postalCode: org?.postalCode ?? null,
    city: org?.city ?? null,
    phone: org?.phone ?? null,
    website: org?.website ?? null,
    email: org?.email ?? null,
    imprintUrl: org?.imprintUrl ?? null,
    privacyUrl: org?.privacyUrl ?? null,
    latitude: org?.latitude ?? null,
    longitude: org?.longitude ?? null,
    openingHours: Array.isArray(org?.openingHours)
      ? (org.openingHours as unknown as OpeningHours[])
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
        customer={customer}
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
