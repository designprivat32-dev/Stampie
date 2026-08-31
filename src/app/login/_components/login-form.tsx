'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { dashboardLoginAction } from '@/actions/dashboard-auth'

/**
 * The sign-in form.
 *
 * Navigates on success rather than letting the action redirect — see the action for why,
 * and with a full document load rather than `router.replace`. The client router keeps RSC
 * payloads that were rendered for the signed-out visitor, and a soft navigation across a
 * sign-in stalls: the destination renders server-side but never commits. A real navigation
 * starts from a clean cache with the cookie attached.
 */
export function LoginForm({ target }: { target: string }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await dashboardLoginAction({ email, password })
      if (!result.success) {
        setError(result.error.message)
        setPassword('')
        return
      }
      // Deliberately not router.replace — see the comment above.
      window.location.assign(target)
    })
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-lg border border-line bg-surface p-6 shadow-xs"
    >
      <div className="space-y-1.5">
        <Label htmlFor="email">E-Mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          autoFocus
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error !== null}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Passwort</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={error !== null}
        />
      </div>

      {error ? (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      ) : null}

      <Button type="submit" variant="primary" className="w-full" disabled={pending}>
        {pending ? 'Wird geprüft…' : 'Anmelden'}
      </Button>
    </form>
  )
}
