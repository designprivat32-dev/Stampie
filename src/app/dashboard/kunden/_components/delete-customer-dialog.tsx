'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label, FieldError } from '@/components/ui/label'
import { Spinner } from '@/components/ui/misc'
import { deleteCustomerAction } from '@/actions/customers'
import type { CustomerRecord } from '@/lib/customers/customer-service'

/**
 * Die Rückfrage vor dem Löschen eines Kunden.
 *
 * Sie sagt, was verschwindet (Stammdaten, App-Zugänge) und was bleibt (die Karten, dann
 * ohne Kunde). Danach das Passwort: geprüft wird es auf dem Server (`lib/auth/reauth`),
 * das Feld hier ist nur die Eingabe dafür.
 */
export function DeleteCustomerDialog({
  customer,
  onOpenChange,
}: {
  customer: CustomerRecord | null
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  // Jede neue Rückfrage startet leer — ein stehengebliebenes Passwort wäre genau die
  // Bequemlichkeit, die diese Abfrage verhindern soll.
  React.useEffect(() => {
    if (customer === null) {
      setPassword('')
      setError(null)
    }
  }, [customer])

  const submit = async () => {
    if (!customer || password.length === 0) return
    setBusy(true)
    setError(null)
    try {
      const result = await deleteCustomerAction(customer.id, password)
      if (!result.success) {
        setError(result.error.message)
        setPassword('')
        return
      }
      onOpenChange(false)
      router.refresh()
    } catch {
      setError('Der Kunde konnte nicht gelöscht werden. Bitte erneut versuchen.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={customer !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{customer ? `„${customer.name}" löschen?` : 'Kunde löschen?'}</DialogTitle>
          <DialogDescription>
            Kontaktdaten, Adresse und alle App-Zugänge dieses Kunden werden gelöscht.{' '}
            {customer && customer.cardCount > 0
              ? `${customer.cardCount === 1 ? 'Seine Karte bleibt' : `Seine ${customer.cardCount} Karten bleiben`} erhalten und ist danach keinem Kunden mehr zugewiesen. `
              : null}
            Das lässt sich nicht rückgängig machen.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <Label htmlFor="delete-customer-password">Zum Bestätigen dein Passwort</Label>
          <Input
            id="delete-customer-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={error !== null}
            disabled={busy}
          />
          <FieldError>{error}</FieldError>
        </form>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Abbrechen
          </Button>
          <Button
            variant="danger"
            onClick={() => void submit()}
            disabled={busy || password.length === 0}
          >
            {busy ? <Spinner /> : <Trash2 />}
            Endgültig löschen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
