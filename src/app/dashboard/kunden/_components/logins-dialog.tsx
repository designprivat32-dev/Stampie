'use client'

import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge, Spinner } from '@/components/ui/misc'
import {
  createBusinessLoginAction,
  listBusinessLoginsAction,
  resetBusinessLoginPasswordAction,
} from '@/actions/business-login'
import type { CustomerRecord } from '@/lib/customers/customer-service'

interface LoginRow {
  userId: string
  username: string
  createdAt: string
  mustChangePassword: boolean
}
interface Cred {
  username: string
  password: string
}

/** Kleiner Kopier-Button: legt den Wert in die Zwischenablage und zeigt kurz „Kopiert". */
function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = React.useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      // Fallback für ältere Browser
      const ta = document.createElement('textarea')
      ta.value = value
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
      } catch {
        /* ignore */
      }
      document.body.removeChild(ta)
    }
    setDone(true)
    setTimeout(() => setDone(false), 1500)
  }
  return (
    <Button variant="ghost" size="sm" aria-label={`${label} kopieren`} onClick={() => void copy()}>
      {done ? '✓ Kopiert' : 'Kopieren'}
    </Button>
  )
}

/**
 * Manage the app logins of one business: list them, add another (multiple staff), or reset
 * a password. Passwords are only ever shown once, right after they are generated.
 */
export function LoginsDialog({
  customer,
  onOpenChange,
}: {
  customer: CustomerRecord | null
  onOpenChange: (open: boolean) => void
}) {
  const [rows, setRows] = React.useState<LoginRow[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null) // 'new' | userId
  const [cred, setCred] = React.useState<Cred | null>(null)

  const load = React.useCallback(async (orgId: string) => {
    setRows(null)
    setError(null)
    const res = await listBusinessLoginsAction(orgId)
    if (!res.success) {
      setError(res.error.message)
      setRows([])
      return
    }
    setRows(res.data)
  }, [])

  React.useEffect(() => {
    if (!customer) return
    setCred(null)
    void load(customer.id)
  }, [customer, load])

  const createNew = async () => {
    if (!customer) return
    setBusy('new')
    setError(null)
    const res = await createBusinessLoginAction(customer.id)
    setBusy(null)
    if (!res.success) return setError(res.error.message)
    setCred(res.data)
    void load(customer.id)
  }

  const reset = async (userId: string) => {
    if (!customer) return
    setBusy(userId)
    setError(null)
    const res = await resetBusinessLoginPasswordAction(userId)
    setBusy(null)
    if (!res.success) return setError(res.error.message)
    setCred(res.data)
    void load(customer.id)
  }

  return (
    <Dialog open={customer !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>App-Zugänge{customer ? ` — ${customer.name}` : ''}</DialogTitle>
          <DialogDescription>
            Logins für die Betriebs-App. Passwörter werden nur einmal angezeigt.
          </DialogDescription>
        </DialogHeader>

        {cred ? (
          <div className="space-y-2 rounded-md border border-accent/30 bg-accent-soft p-3">
            <p className="text-[12px] text-ink-2">Bitte notieren und der Firma geben:</p>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12px] text-ink-3">Benutzername</span>
              <div className="flex items-center gap-2">
                <code className="text-[13px] font-medium text-ink">{cred.username}</code>
                <CopyButton value={cred.username} label="Benutzername" />
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12px] text-ink-3">Passwort</span>
              <div className="flex items-center gap-2">
                <code className="text-[13px] font-medium text-ink">{cred.password}</code>
                <CopyButton value={cred.password} label="Passwort" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(`Benutzername: ${cred.username}\nPasswort: ${cred.password}`)
                    .catch(() => {})
                }
              >
                Beides kopieren
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCred(null)}>
                Ausblenden
              </Button>
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          {rows === null ? (
            <div className="flex justify-center py-4">
              <Spinner />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-2 text-[13px] text-ink-3">Noch kein Zugang angelegt.</p>
          ) : (
            rows.map((r) => (
              <div
                key={r.userId}
                className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <code className="truncate text-[13px] font-medium text-ink">{r.username}</code>
                  <CopyButton value={r.username} label="Benutzername" />
                  {r.mustChangePassword ? <Badge tone="warn">PW-Änderung offen</Badge> : null}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy === r.userId}
                  onClick={() => void reset(r.userId)}
                >
                  {busy === r.userId ? <Spinner /> : null}
                  Passwort zurücksetzen
                </Button>
              </div>
            ))
          )}
        </div>

        {error ? (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="primary" disabled={busy === 'new'} onClick={() => void createNew()}>
            {busy === 'new' ? <Spinner /> : null}
            Neues Login
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
