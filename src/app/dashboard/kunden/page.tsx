import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession, isAgency } from '@/lib/auth/session'
import { accessibleOrgIds } from '@/lib/cards/card-service'
import { listCustomerRecords } from '@/lib/customers/customer-service'
import { CustomersView } from './_components/customers-view'

export const dynamic = 'force-dynamic'

/**
 * Customer overview.
 *
 * Agency members see and manage every customer; a customer login sees only its own
 * organisation. The split happens in `accessibleOrgIds`, which returns null for agency.
 */
export default async function KundenPage() {
  const session = await getSession()
  if (!session) redirect('/')

  const agency = await isAgency(session.userId)
  const orgIds = await accessibleOrgIds(session.userId)
  const customers = await listCustomerRecords(orgIds)

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line bg-surface px-6 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="flex items-center gap-5">
            <span className="text-[14px] font-semibold text-ink">Stemply</span>
            <nav className="flex items-center gap-4 text-[13px]">
              <Link href="/dashboard/karten" className="text-ink-3 transition-colors hover:text-ink">
                Karten
              </Link>
              <Link href="/dashboard/kunden" className="font-medium text-ink">
                Kunden
              </Link>
            </nav>
          </div>
          <span className="text-[12px] text-ink-3">
            {agency ? 'Agentur-Zugang' : session.email}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        <CustomersView customers={customers} canManage={agency} />
      </main>
    </div>
  )
}
