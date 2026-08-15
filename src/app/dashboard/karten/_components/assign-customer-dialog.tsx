'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field } from '@/components/ui/label'
import { Spinner } from '@/components/ui/misc'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { assignCardAction } from '@/actions/cards'
import type { CardSummary, CustomerOption } from '@/lib/cards/card-service'

const NO_CUSTOMER = '__none__'

/**
 * Assignment is what decides who may stamp. Taking a card back therefore also takes the
 * stamping right away — the dialog says so rather than letting it be a surprise.
 */
export function AssignCustomerDialog({
  card,
  customers,
  onOpenChange,
}: {
  card: CardSummary | null
  customers: CustomerOption[]
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [orgId, setOrgId] = React.useState<string>(NO_CUSTOMER)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!card) return
    setOrgId(card.orgId ?? NO_CUSTOMER)
    setError(null)
  }, [card])

  const submit = async () => {
    if (!card) return
    setBusy(true)
    setError(null)
    try {
      const result = await assignCardAction({
        cardId: card.id,
        orgId: orgId === NO_CUSTOMER ? null : orgId,
      })
      if (!result.success) {
        setError(result.error.message)
        return
      }
      onOpenChange(false)
      router.refresh()
    } catch {
      setError('Die Zuweisung hat nicht geklappt. Bitte erneut versuchen.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={card !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Karte zuweisen</DialogTitle>
          <DialogDescription>
            Der zugewiesene Betrieb darf diese Karte stempeln. Ohne Zuweisung kann niemand
            stempeln — auch die Verwaltung nicht.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Kunde" htmlFor="assign-org">
            <Select value={orgId} onValueChange={setOrgId}>
              <SelectTrigger id="assign-org">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CUSTOMER}>Nicht zugewiesen</SelectItem>
                {customers.map((customer) => (
                  <SelectItem key={customer.id} value={customer.id}>
                    {customer.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {orgId === NO_CUSTOMER && card?.issuedCount ? (
            <p className="rounded-md border border-warn/40 bg-warn-soft px-3 py-2 text-[12px] leading-snug text-warn-ink">
              Für diese Karte sind bereits {card.issuedCount} Karten ausgegeben. Ohne Zuweisung
              kann sie niemand mehr stempeln.
            </p>
          ) : null}
        </div>

        {error ? (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Abbrechen
          </Button>
          <Button variant="primary" disabled={busy} onClick={submit}>
            {busy ? <Spinner /> : null}
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
