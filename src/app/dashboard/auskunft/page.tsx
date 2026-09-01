import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/auth/session'
import { LogoutButton } from '@/components/logout-button'
import { PassLookup } from './_components/pass-lookup'

export const dynamic = 'force-dynamic'

/**
 * Auskunft und Löschung zu einer einzelnen Karte.
 *
 * Damit ein Betrieb auf eine Anfrage nach Art. 15 oder Art. 17 antworten kann, ohne dass
 * jemand mit einem Datenbank-Zugang in der Produktion suchen muss.
 */
export default async function AuskunftPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (session.mustChangePassword) redirect('/dashboard/konto')

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
              <Link href="/dashboard/kunden" className="text-ink-3 transition-colors hover:text-ink">
                Kunden
              </Link>
              <Link href="/dashboard/auskunft" className="font-medium text-ink">
                Auskunft
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

      <main className="mx-auto max-w-2xl px-6 py-8">
        <h1 className="text-[17px] font-semibold text-ink">Auskunft und Löschung</h1>
        <p className="mt-1 max-w-prose text-[13px] leading-snug text-ink-3">
          Fragt ein Kunde, welche Daten zu seiner Karte gespeichert sind, oder verlangt er
          deren Löschung: Kartennummer eingeben. Sie steht auf der Karte im Wallet, unter
          dem Strichcode.
        </p>
        <div className="mt-6">
          <PassLookup />
        </div>
      </main>
    </div>
  )
}
