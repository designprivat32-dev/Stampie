'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { dashboardLogoutAction } from '@/actions/dashboard-auth'

/** Ends the operator session and returns to the sign-in page. */
export function LogoutButton() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await dashboardLogoutAction()
          router.refresh()
          router.replace('/login')
        })
      }
      className="text-[12px] text-ink-3 transition-colors hover:text-ink disabled:opacity-50"
    >
      {pending ? 'Wird abgemeldet…' : 'Abmelden'}
    </button>
  )
}
