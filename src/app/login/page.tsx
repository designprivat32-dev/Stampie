import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { LoginForm } from './_components/login-form'

export const dynamic = 'force-dynamic'

/**
 * Operator sign-in.
 *
 * The only page under the dashboard's gate that is reachable without a session — the
 * middleware sends everything else here.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const session = await getSession()
  const { next } = await searchParams

  // Only ever bounce back into the dashboard: an attacker-supplied `next` must not turn
  // the login into an open redirect.
  const target = next && /^\/dashboard(\/|$)/.test(next) ? next : '/dashboard/karten'

  if (session) redirect(target)

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-[15px] font-semibold text-ink">Stemply</p>
          <p className="mt-1 text-[13px] text-ink-3">Betreiber-Anmeldung</p>
        </div>
        <LoginForm target={target} />
      </div>
    </div>
  )
}
