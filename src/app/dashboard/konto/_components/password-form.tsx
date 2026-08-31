'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label, FieldError } from '@/components/ui/label'
import { changeDashboardPasswordAction } from '@/actions/dashboard-auth'

/**
 * Password change.
 *
 * Field errors come back keyed by field name in the action's envelope, so each control can
 * show its own message instead of one banner for everything.
 */
export function PasswordForm({ forced }: { forced: boolean }) {
  const router = useRouter()
  const [currentPassword, setCurrent] = useState('')
  const [newPassword, setNew] = useState('')
  const [repeatPassword, setRepeat] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [done, setDone] = useState(false)
  const [pending, startTransition] = useTransition()

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setMessage(null)
    setFields({})
    startTransition(async () => {
      const result = await changeDashboardPasswordAction({
        currentPassword,
        newPassword,
        repeatPassword,
      })

      if (!result.success) {
        setMessage(result.error.message)
        setFields(result.error.fields ?? {})
        return
      }

      // A forced change had nowhere to go until now; the change also swapped the session
      // cookie, so reload rather than soft-navigate.
      if (forced) {
        window.location.assign('/dashboard/karten')
        return
      }

      setDone(true)
      setCurrent('')
      setNew('')
      setRepeat('')
      router.refresh()
    })
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-lg border border-line bg-surface p-6 shadow-xs"
    >
      <div className="space-y-1.5">
        <Label htmlFor="currentPassword">Aktuelles Passwort</Label>
        <Input
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(e) => setCurrent(e.target.value)}
          aria-invalid={Boolean(fields.currentPassword)}
        />
        <FieldError>{fields.currentPassword}</FieldError>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="newPassword">Neues Passwort</Label>
        <Input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={newPassword}
          onChange={(e) => setNew(e.target.value)}
          aria-invalid={Boolean(fields.newPassword)}
        />
        <FieldError>{fields.newPassword}</FieldError>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="repeatPassword">Neues Passwort wiederholen</Label>
        <Input
          id="repeatPassword"
          type="password"
          autoComplete="new-password"
          required
          value={repeatPassword}
          onChange={(e) => setRepeat(e.target.value)}
          aria-invalid={Boolean(fields.repeatPassword)}
        />
        <FieldError>{fields.repeatPassword}</FieldError>
      </div>

      {message && Object.keys(fields).length === 0 ? (
        <p role="alert" className="text-[13px] text-danger">
          {message}
        </p>
      ) : null}

      {done ? (
        <p role="status" className="text-[13px] text-ink-2">
          Passwort geändert.
        </p>
      ) : null}

      <Button type="submit" variant="primary" className="w-full" disabled={pending}>
        {pending ? 'Wird gespeichert…' : 'Passwort ändern'}
      </Button>
    </form>
  )
}
