'use client'

import { useTransition } from 'react'
import { dashboardLogoutAction } from '@/actions/dashboard-auth'

/** Ends the operator session and returns to the sign-in page. */
export function LogoutButton() {
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await dashboardLogoutAction()
          // Full load, so nothing rendered for the signed-in operator survives in the
          // client router's cache.
          window.location.assign('/login')
        })
      }
      className="text-[12px] text-ink-3 transition-colors hover:text-ink disabled:opacity-50"
    >
      {pending ? 'Wird abgemeldet…' : 'Abmelden'}
    </button>
  )
}
