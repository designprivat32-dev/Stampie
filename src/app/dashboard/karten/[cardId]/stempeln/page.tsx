import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Palette } from 'lucide-react'
import { TillView } from './_components/till-view'
import {
  assertCardAccess,
  CardAccessError,
  StampPermissionError,
  UnauthorizedError,
} from '@/lib/auth/session'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** Staff view: book stamps by scanning the customer's card. */
export default async function StempelnPage({
  params,
  searchParams,
}: {
  params: Promise<{ cardId: string }>
  searchParams: Promise<{ serial?: string }>
}) {
  const { cardId } = await params
  // Set when staff arrived by scanning the card's barcode, which redirects here.
  const { serial } = await searchParams

  let access
  try {
    access = await assertCardAccess(cardId)
  } catch (e) {
    if (e instanceof CardAccessError || e instanceof UnauthorizedError) notFound()
    throw e
  }

  // Agency accounts design cards but must not book stamps.
  if (!access.canStamp) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-lg font-semibold text-ink">Stempeln ist dem Betrieb vorbehalten</h1>
        <p className="text-[13px] leading-snug text-ink-2">
          Mit dem Agentur-Zugang lassen sich Karten gestalten und Testkarten erzeugen, aber keine
          Stempel buchen. Ein Stempel gehört zu dem, der etwas verkauft hat.
        </p>
        <Link
          href={`/dashboard/karten/${access.cardId}`}
          className="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2 hover:bg-surface-2"
        >
          Zurück zum Designer
        </Link>
      </main>
    )
  }

  const card = await prisma.card.findFirst({
    where: { id: access.cardId },
    select: { name: true, kind: true, org: { select: { name: true } } },
  })
  if (!card) notFound()

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-semibold text-ink">
              {card.kind === 'COUPON' ? 'Gutschein einlösen' : 'Stempeln'}
            </h1>
            <p className="truncate text-[12px] text-ink-3">{card.org?.name ?? card.name}</p>
          </div>
          <Link
            href={`/dashboard/karten/${access.cardId}`}
            className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-[12px] text-ink-2 hover:bg-surface-2"
          >
            <Palette className="size-3.5" />
            Designer
          </Link>
        </div>
      </header>

      <TillView cardId={access.cardId} cardKind={card.kind} initialSerial={serial ?? null} />
    </div>
  )
}
