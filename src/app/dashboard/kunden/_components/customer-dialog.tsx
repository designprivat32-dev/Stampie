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
import { createCustomerAction, geocodeAddressAction, updateCustomerAction } from '@/actions/customers'
import { MapPin, Search } from 'lucide-react'
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
  const [coordinates, setCoordinates] = React.useState<{ latitude: number; longitude: number } | null>(
    null,
  )
  /** Die gefundene Schreibweise der Adresse — nur zum Gegenlesen, nichts davon wird gespeichert. */
  const [foundLabel, setFoundLabel] = React.useState<string | null>(null)
  const [searching, setSearching] = React.useState(false)
  const [geoError, setGeoError] = React.useState<string | null>(null)
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
    setCoordinates(
      editing?.latitude !== null && editing?.latitude !== undefined && editing.longitude !== null
        ? { latitude: editing.latitude, longitude: editing.longitude }
        : null,
    )
    setFoundLabel(null)
    setGeoError(null)
    setError(null)
    setFieldErrors({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const submit = async () => {
    setBusy(true)
    setError(null)
    setFieldErrors({})
    try {
      const payload = {
        name,
        phone,
        email,
        street,
        postalCode,
        city,
        website,
        imprintUrl,
        privacyUrl,
        latitude: coordinates?.latitude ?? null,
        longitude: coordinates?.longitude ?? null,
      }
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

  /**
   * Adresse → Koordinaten. Der Treffer wird angezeigt, nicht stillschweigend übernommen:
   * ein Pin, den niemand gegengelesen hat, schickt später Benachrichtigungen an der
   * falschen Straßenecke los.
   */
  const searchCoordinates = async () => {
    setSearching(true)
    setGeoError(null)
    setFoundLabel(null)
    try {
      const result = await geocodeAddressAction({ street, postalCode, city })
      if (!result.success) {
        setGeoError(result.error.message)
        return
      }
      setCoordinates({ latitude: result.data.latitude, longitude: result.data.longitude })
      setFoundLabel(result.data.label)
    } catch {
      setGeoError('Die Adresse konnte nicht gesucht werden. Bitte erneut versuchen.')
    } finally {
      setSearching(false)
    }
  }

  const canSearch = postalCode.trim().length > 0 || city.trim().length > 0

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
            Die Koordinaten hängen an der Adresse, deshalb stehen sie hier und nicht in
            einem eigenen Abschnitt. Ohne sie bleibt die Standort-Benachrichtigung der
            Karten gesperrt — das sagt der Hinweis auch.
          */}
          <div className="space-y-2 rounded-lg border border-line bg-surface-2 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
                  <MapPin className="size-3.5 shrink-0 text-ink-3" />
                  Standort für Benachrichtigungen
                </p>
                <p className="text-[12px] leading-snug text-ink-3">
                  {coordinates
                    ? `${coordinates.latitude.toFixed(5)}, ${coordinates.longitude.toFixed(5)}`
                    : 'Noch keine Koordinaten. Ohne sie kann die Karte niemanden in der Nähe benachrichtigen.'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {coordinates ? (
                  <Button variant="ghost" size="sm" onClick={() => {
                    setCoordinates(null)
                    setFoundLabel(null)
                  }}>
                    Entfernen
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={searching || !canSearch}
                  title={canSearch ? undefined : 'Erst PLZ oder Ort eintragen.'}
                  onClick={() => void searchCoordinates()}
                >
                  {searching ? <Spinner /> : <Search />}
                  Adresse suchen
                </Button>
              </div>
            </div>

            {foundLabel ? (
              <p className="text-[12px] leading-snug text-ok">Gefunden: {foundLabel}</p>
            ) : null}
            {geoError ? (
              <p role="alert" className="text-[12px] leading-snug text-warn-ink">
                {geoError}
              </p>
            ) : null}
            <p className="text-[11px] leading-snug text-ink-3">
              Die Suche fragt OpenStreetMap. Dorthin geht dabei die eingetippte Adresse, sonst
              nichts.
            </p>
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
