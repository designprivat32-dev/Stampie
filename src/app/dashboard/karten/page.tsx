import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CardGrid } from './_components/card-grid'
import { getSession, isAgency } from '@/lib/auth/session'
import { accessibleOrgIds, listCards, listCustomers } from '@/lib/cards/card-service'

export const dynamic = 'force-dynamic'

/**
 * Card overview — the dashboard entry point.
 *
 * Agency members see every card, including ones not yet handed to a customer. Customers
 * see only their own. The split happens in `accessibleOrgIds`, which returns null for
 * agency and is read by the queries as "no restriction".
 */
export default async function KartenPage() {
  const session = await getSession()
  if (!session) redirect('/')

  const agency = await isAgency(session.userId)
  const orgIds = await accessibleOrgIds(session.userId)

  const [cards, customers] = await Promise.all([listCards({ orgIds }), listCustomers(orgIds)])

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line bg-surface px-6 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="flex items-center gap-5">
            <span className="text-[14px] font-semibold text-ink">Stampie</span>
            <nav className="flex items-center gap-4 text-[13px]">
              <Link href="/dashboard/karten" className="font-medium text-ink">
                Karten
              </Link>
              <Link href="/dashboard/kunden" className="text-ink-3 transition-colors hover:text-ink">
                Kunden
              </Link>
            </nav>
          </div>
          <span className="text-[12px] text-ink-3">
            {agency ? 'Agentur-Zugang' : (customers[0]?.name ?? session.email)}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        <CardGrid
          cards={cards}
          customers={customers}
          canAssign={agency}
          // Single-operator setup: this login both manages customers and runs the till, so
          // it may stamp any assigned card. (The button only shows for assigned cards.)
          canStamp
        />
      </main>
    </div>
  )
}
