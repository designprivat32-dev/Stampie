import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/auth/session'
import { LogoutButton } from '@/components/logout-button'
import { listCustomerRecords } from '@/lib/customers/customer-service'
import { CustomersView } from './_components/customers-view'

export const dynamic = 'force-dynamic'

/**
 * Customer overview.
 *
 * Every signed-in operator may manage every customer — there is no agency/owner split
 * here. Access is the `DASHBOARD_ADMIN_EMAILS` allowlist, which no business login is on.
 */
export default async function KundenPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  // A temporary password has to be replaced before anything else is reachable.
  if (session.mustChangePassword) redirect('/dashboard/konto')

  const customers = await listCustomerRecords(null)

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
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard/konto"
              className="text-[12px] text-ink-3 transition-colors hover:text-ink"
            >
              {session.email}
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        <CustomersView customers={customers} canManage />
      </main>
    </div>
  )
}
