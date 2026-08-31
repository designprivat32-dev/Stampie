import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/auth/session'
import { LogoutButton } from '@/components/logout-button'
import { PasswordForm } from './_components/password-form'

export const dynamic = 'force-dynamic'

/**
 * The operator's own account.
 *
 * Also the page a forced password change lands on: an account set up with a temporary
 * password carries `mustChangePassword`, and the other dashboard pages bounce here until
 * it is cleared.
 */
export default async function KontoPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const forced = session.mustChangePassword

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line bg-surface px-6 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="flex items-center gap-5">
            <span className="text-[14px] font-semibold text-ink">Stemply</span>
            {/* While a change is forced there is nowhere else to go — offering the links
                would just bounce back here. */}
            {forced ? null : (
              <nav className="flex items-center gap-4 text-[13px]">
                <Link href="/dashboard/karten" className="text-ink-3 transition-colors hover:text-ink">
                  Karten
                </Link>
                <Link href="/dashboard/kunden" className="text-ink-3 transition-colors hover:text-ink">
                  Kunden
                </Link>
              </nav>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[12px] text-ink-3">{session.email}</span>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md px-6 py-10">
        <h1 className="text-[15px] font-semibold text-ink">Passwort ändern</h1>
        <p className="mt-1 text-[13px] text-ink-3">
          {forced
            ? 'Dieses Konto hat noch ein vergebenes Startpasswort. Bitte jetzt ein eigenes setzen.'
            : `Angemeldet als ${session.email}.`}
        </p>

        <div className="mt-5">
          <PasswordForm forced={forced} />
        </div>

        <p className="mt-6 text-[12px] leading-relaxed text-ink-3">
          Nach dem Ändern wirst du auf allen anderen Geräten abgemeldet. Der Zugang der
          Betriebe zur App bleibt davon unberührt.
        </p>
      </main>
    </div>
  )
}
