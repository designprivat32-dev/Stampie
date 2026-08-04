import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/**
 * Target of the barcode on every card.
 *
 * Staff who are signed in and have access to the card's location go straight to the till
 * view with the card pre-filled. Everyone else — meaning the customer, who is the far more
 * likely person to point a camera at their own card — gets a harmless status page.
 *
 * The counter is never changed here. A URL that stamps on GET would let any customer
 * stamp their own card from the sofa.
 */
export default async function ScanLandingPage({
  params,
}: {
  params: Promise<{ serial: string }>
}) {
  const { serial } = await params

  const pass = await prisma.issuedPass.findFirst({
    where: { serial: serial.toUpperCase() },
    select: {
      serial: true,
      stamps: true,
      stampGoal: true,
      cardId: true,
      card: { select: { name: true, orgId: true, org: { select: { name: true } } } },
    },
  })

  if (!pass) {
    return (
      <Shell title="Karte nicht gefunden">
        <p>Diese Kartennummer gehört zu keiner ausgegebenen Karte.</p>
      </Shell>
    )
  }

  const session = await getSession()
  // Only staff of the owning business are sent to the till — agency accounts and everyone
  // else see the customer view, because they are not allowed to stamp anyway.
  if (session && pass.card.orgId) {
    const membership = await prisma.membership.findFirst({
      where: { userId: session.userId, orgId: pass.card.orgId, role: { in: ['OWNER', 'MEMBER'] } },
      select: { id: true },
    })
    if (membership) {
      redirect(`/dashboard/karten/${pass.cardId}/stempeln?serial=${pass.serial}`)
    }
  }

  return (
    <Shell title={pass.card.org?.name ?? pass.card.name}>
      <p className="text-[13px] text-ink-2">Dein Stempelstand</p>
      <p className="mt-2 text-5xl font-semibold tabular-nums text-ink">
        {pass.stamps}
        <span className="text-2xl text-ink-3"> / {pass.stampGoal}</span>
      </p>
      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full bg-accent"
          style={{ width: `${Math.min(100, (pass.stamps / pass.stampGoal) * 100)}%` }}
        />
      </div>
      <p className="mt-5 text-[13px] leading-snug text-ink-3">
        Zum Sammeln zeig diese Karte beim Bezahlen vor — das Personal scannt sie.
      </p>
    </Shell>
  )
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center px-6 text-center">
      <div className="w-full rounded-2xl border border-line bg-surface px-6 py-8">
        <h1 className="mb-4 text-lg font-semibold text-ink">{title}</h1>
        {children}
      </div>
    </main>
  )
}
