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
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { Spinner } from '@/components/ui/misc'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createCardAction } from '@/actions/cards'
import { CARD_TEMPLATES } from '@/lib/cards/templates'
import type { CustomerOption } from '@/lib/cards/card-service'

const NO_CUSTOMER = '__none__'
const NO_LOCATION = '__none__'
const NO_TEMPLATE = '__none__'

/**
 * Creates the card, then goes straight into the designer — "erst Übersicht, dann das Tool".
 * Everything here is optional except the name; a card can be designed long before anyone
 * decides which customer gets it.
 */
export function NewCardDialog({
  open,
  onOpenChange,
  customers,
  canChooseCustomer,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  customers: CustomerOption[]
  canChooseCustomer: boolean
}) {
  const router = useRouter()
  const [name, setName] = React.useState('')
  const [orgId, setOrgId] = React.useState<string>(NO_CUSTOMER)
  const [locationId, setLocationId] = React.useState<string>(NO_LOCATION)
  const [templateId, setTemplateId] = React.useState<string>(NO_TEMPLATE)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setName('')
    setOrgId(canChooseCustomer ? NO_CUSTOMER : (customers[0]?.id ?? NO_CUSTOMER))
    setLocationId(NO_LOCATION)
    setTemplateId(NO_TEMPLATE)
    setError(null)
  }, [open, canChooseCustomer, customers])

  const locations = customers.find((c) => c.id === orgId)?.locations ?? []

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await createCardAction({
        name: name.trim(),
        orgId: orgId === NO_CUSTOMER ? null : orgId,
        locationId: locationId === NO_LOCATION ? null : locationId,
        templateId: templateId === NO_TEMPLATE ? null : templateId,
      })
      if (!result.success) {
        setError(result.error.message)
        return
      }
      onOpenChange(false)
      router.push(`/dashboard/karten/${result.data.cardId}`)
    } catch {
      setError('Die Karte konnte nicht angelegt werden. Bitte erneut versuchen.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Neue Karte</DialogTitle>
          <DialogDescription>
            Nach dem Anlegen geht es direkt in den Designer. Kunde und Filiale lassen sich
            jederzeit nachtragen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Name der Karte" htmlFor="card-name" hint="Nur intern sichtbar.">
            <Input
              id="card-name"
              value={name}
              maxLength={60}
              placeholder="Kaffeekarte Café Nord"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && name.trim()) void submit()
              }}
            />
          </Field>

          {canChooseCustomer ? (
            <Field label="Kunde" htmlFor="card-org" hint="Bestimmt, wer stempeln darf.">
              <Select
                value={orgId}
                onValueChange={(value) => {
                  setOrgId(value)
                  setLocationId(NO_LOCATION)
                }}
              >
                <SelectTrigger id="card-org">
                  <SelectValue placeholder="Noch nicht zuweisen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CUSTOMER}>Noch nicht zuweisen</SelectItem>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}

          {locations.length > 0 ? (
            <Field
              label="Filiale"
              htmlFor="card-location"
              hint="Optional — füllt Adresse und Öffnungszeiten vor."
            >
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger id="card-location">
                  <SelectValue placeholder="Keine" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_LOCATION}>Keine</SelectItem>
                  {locations.map((location) => (
                    <SelectItem key={location.id} value={location.id}>
                      {location.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}

          <Field label="Vorlage" htmlFor="card-template" hint="Setzt Farben, Symbol und Texte.">
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger id="card-template">
                <SelectValue placeholder="Ohne Vorlage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TEMPLATE}>Ohne Vorlage</SelectItem>
                {CARD_TEMPLATES.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.badge} {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
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
          <Button variant="primary" disabled={busy || name.trim().length === 0} onClick={submit}>
            {busy ? <Spinner /> : null}
            Anlegen und gestalten
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
