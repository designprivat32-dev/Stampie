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
import { createCustomerAction, updateCustomerAction } from '@/actions/customers'
import type { CustomerRecord } from '@/lib/customers/customer-service'

type DialogState = { mode: 'create' } | { mode: 'edit'; customer: CustomerRecord } | null

/**
 * One dialog for both creating and editing a customer — the form is identical, only the
 * server action and the prefilled values differ.
 */
export function CustomerDialog({
  state,
  onOpenChange,
}: {
  state: DialogState
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const editing = state?.mode === 'edit' ? state.customer : null

  const [name, setName] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [street, setStreet] = React.useState('')
  const [postalCode, setPostalCode] = React.useState('')
  const [city, setCity] = React.useState('')
  const [website, setWebsite] = React.useState('')
  const [imprintUrl, setImprintUrl] = React.useState('')
  const [privacyUrl, setPrivacyUrl] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({})

  React.useEffect(() => {
    if (!state) return
    setName(editing?.name ?? '')
    setPhone(editing?.phone ?? '')
    setEmail(editing?.email ?? '')
    setStreet(editing?.street ?? '')
    setPostalCode(editing?.postalCode ?? '')
    setCity(editing?.city ?? '')
    setWebsite(editing?.website ?? '')
    setImprintUrl(editing?.imprintUrl ?? '')
    setPrivacyUrl(editing?.privacyUrl ?? '')
    setError(null)
    setFieldErrors({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const submit = async () => {
    setBusy(true)
    setError(null)
    setFieldErrors({})
    try {
      const payload = { name, phone, email, street, postalCode, city, website, imprintUrl, privacyUrl }
      const result =
        state?.mode === 'edit'
          ? await updateCustomerAction(state.customer.id, payload)
          : await createCustomerAction(payload)

      if (!result.success) {
        setError(result.error.message)
        if (result.error.fields) setFieldErrors(result.error.fields)
        return
      }
      onOpenChange(false)
      router.refresh()
    } catch {
      setError('Der Kunde konnte nicht gespeichert werden. Bitte erneut versuchen.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={state !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Kunde bearbeiten' : 'Neuer Kunde'}</DialogTitle>
          <DialogDescription>
            Firma mit Kontaktdaten. Nur der Name ist Pflicht — der Rest lässt sich jederzeit
            nachtragen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Name der Firma" htmlFor="cust-name" error={fieldErrors.name}>
            <Input
              id="cust-name"
              value={name}
              maxLength={120}
              placeholder="Café Nord GmbH"
              aria-invalid={Boolean(fieldErrors.name)}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Telefon" htmlFor="cust-phone" error={fieldErrors.phone}>
              <Input
                id="cust-phone"
                value={phone}
                maxLength={40}
                placeholder="030 1234567"
                onChange={(e) => setPhone(e.target.value)}
              />
            </Field>
            <Field label="E-Mail" htmlFor="cust-email" error={fieldErrors.email}>
              <Input
                id="cust-email"
                value={email}
                maxLength={160}
                placeholder="kontakt@cafe-nord.de"
                aria-invalid={Boolean(fieldErrors.email)}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
          </div>

          <Field label="Straße und Hausnummer" htmlFor="cust-street" error={fieldErrors.street}>
            <Input
              id="cust-street"
              value={street}
              maxLength={160}
              placeholder="Hauptstraße 12"
              onChange={(e) => setStreet(e.target.value)}
            />
          </Field>

          <div className="grid grid-cols-[7rem_1fr] gap-3">
            <Field label="PLZ" htmlFor="cust-plz" error={fieldErrors.postalCode}>
              <Input
                id="cust-plz"
                value={postalCode}
                maxLength={20}
                placeholder="10115"
                onChange={(e) => setPostalCode(e.target.value)}
              />
            </Field>
            <Field label="Ort" htmlFor="cust-city" error={fieldErrors.city}>
              <Input
                id="cust-city"
                value={city}
                maxLength={120}
                placeholder="Berlin"
                onChange={(e) => setCity(e.target.value)}
              />
            </Field>
          </div>

          {/*
            Links, not decoration: a published pass has to carry an imprint and a privacy
            link, and the designer offers exactly these as one-click back fields.
          */}
          <Field label="Website" htmlFor="cust-website" error={fieldErrors.website}>
            <Input
              id="cust-website"
              value={website}
              maxLength={200}
              placeholder="https://cafe-nord.de"
              onChange={(e) => setWebsite(e.target.value)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Impressum" htmlFor="cust-imprint" error={fieldErrors.imprintUrl}>
              <Input
                id="cust-imprint"
                value={imprintUrl}
                maxLength={200}
                placeholder="https://cafe-nord.de/impressum"
                onChange={(e) => setImprintUrl(e.target.value)}
              />
            </Field>
            <Field label="Datenschutz" htmlFor="cust-privacy" error={fieldErrors.privacyUrl}>
              <Input
                id="cust-privacy"
                value={privacyUrl}
                maxLength={200}
                placeholder="https://cafe-nord.de/datenschutz"
                onChange={(e) => setPrivacyUrl(e.target.value)}
              />
            </Field>
          </div>
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
            {editing ? 'Speichern' : 'Anlegen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
