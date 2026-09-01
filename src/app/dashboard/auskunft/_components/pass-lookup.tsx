'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label, FieldError } from '@/components/ui/label'
import { Spinner } from '@/components/ui/misc'
import { deletePassDataAction, lookupPassAction, type PassRecord } from '@/actions/data-subject'

/** Zeitpunkte in der Auskunft: gleiche Schreibweise auf dem Bildschirm und im Text. */
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : '—'

/**
 * Sucht eine Karte über ihre Nummer, zeigt alles Gespeicherte und löscht es auf Wunsch.
 *
 * Die Auskunft gibt es zusätzlich als Text zum Kopieren — der Betrieb muss dem Kunden
 * etwas schicken können, und ein Bildschirmfoto ist dafür das falsche Werkzeug.
 */
export function PassLookup() {
  const [serial, setSerial] = React.useState('')
  const [record, setRecord] = React.useState<PassRecord | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [copied, setCopied] = React.useState(false)

  const [confirming, setConfirming] = React.useState(false)
  const [password, setPassword] = React.useState('')
  const [deleteError, setDeleteError] = React.useState<string | null>(null)
  const [deleted, setDeleted] = React.useState<string | null>(null)

  const reset = () => {
    setRecord(null)
    setError(null)
    setConfirming(false)
    setPassword('')
    setDeleteError(null)
    setCopied(false)
  }

  const lookup = async (event: React.FormEvent) => {
    event.preventDefault()
    reset()
    setDeleted(null)
    setBusy(true)
    const result = await lookupPassAction(serial)
    if (result.success) setRecord(result.data)
    else setError(result.error.message)
    setBusy(false)
  }

  const remove = async () => {
    if (!record) return
    setBusy(true)
    setDeleteError(null)
    const result = await deletePassDataAction(record.serial, password)
    if (result.success) {
      setDeleted(record.serial)
      reset()
      setSerial('')
    } else {
      setDeleteError(result.error.message)
      setPassword('')
    }
    setBusy(false)
  }

  const asText = (r: PassRecord) =>
    [
      `Auskunft zur Stempelkarte ${r.serial}`,
      `Betrieb: ${r.organizationName ?? '—'}`,
      `Karte: ${r.cardName}`,
      '',
      `Ausgegeben am: ${when(r.issuedAt)}`,
      `Stempelstand: ${r.stamps} von ${r.stampGoal}`,
      `Eingelöste Belohnungen: ${r.rewardCount}`,
      `Zuletzt geändert: ${when(r.updatedAt)}`,
      `Registrierte Apple-Geräte: ${r.appleDevices}`,
      `Erhaltene Erinnerungen: ${r.reminderDeliveries}`,
      '',
      `Gespeicherte Buchungen (${r.events.length}):`,
      ...r.events.map(
        (e) =>
          `  ${when(e.at)} — ${e.kind}, ${e.delta >= 0 ? '+' : ''}${e.delta}, Stand ${e.balance}`,
      ),
      '',
      'Name, E-Mail-Adresse und Telefonnummer werden zu dieser Karte nicht gespeichert.',
    ].join('\n')

  return (
    <div className="space-y-5">
      <form onSubmit={lookup} className="flex items-end gap-2">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="serial">Kartennummer</Label>
          <Input
            id="serial"
            value={serial}
            onChange={(e) => setSerial(e.target.value)}
            placeholder="K-3D92C1DD4CAC"
            autoComplete="off"
            aria-invalid={error !== null}
          />
        </div>
        <Button type="submit" variant="primary" disabled={busy || serial.trim().length === 0}>
          {busy && !confirming ? <Spinner /> : null}
          Suchen
        </Button>
      </form>

      <FieldError>{error}</FieldError>

      {deleted ? (
        <p
          role="status"
          className="rounded-lg border border-line bg-surface-2 px-4 py-3 text-[13px] text-ink-2"
        >
          Alle Daten zur Karte <strong className="font-medium text-ink">{deleted}</strong> wurden
          gelöscht. Der Pass im Wallet des Kunden lässt sich nicht mehr stempeln und nicht mehr
          aktualisieren.
        </p>
      ) : null}

      {record ? (
        <div className="space-y-4 rounded-lg border border-line bg-surface p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[15px] font-semibold text-ink">{record.serial}</p>
              <p className="text-[13px] text-ink-3">
                {record.organizationName ?? 'ohne Betrieb'} — {record.cardName}
                {record.isTest ? ' (Testkarte)' : ''}
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(asText(record))
                setCopied(true)
                window.setTimeout(() => setCopied(false), 2000)
              }}
            >
              {copied ? 'Kopiert' : 'Als Text kopieren'}
            </Button>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
            <Row label="Ausgegeben am" value={when(record.issuedAt)} />
            <Row label="Stempelstand" value={`${record.stamps} von ${record.stampGoal}`} />
            <Row label="Belohnungen" value={String(record.rewardCount)} />
            <Row label="Zuletzt geändert" value={when(record.updatedAt)} />
            <Row label="Apple-Geräte" value={String(record.appleDevices)} />
            <Row label="Erinnerungen" value={String(record.reminderDeliveries)} />
          </dl>

          <div>
            <p className="text-[13px] font-medium text-ink">Buchungen ({record.events.length})</p>
            {record.events.length === 0 ? (
              <p className="mt-1 text-[12.5px] text-ink-3">
                Keine gespeicherten Buchungen. Ältere werden nach Ablauf der Frist automatisch
                entfernt; der Stempelstand bleibt davon unberührt.
              </p>
            ) : (
              <ul className="mt-1.5 max-h-56 space-y-1 overflow-y-auto text-[12.5px] text-ink-2">
                {record.events.map((e, i) => (
                  <li key={i} className="flex justify-between gap-3 tabular-nums">
                    <span>{when(e.at)}</span>
                    <span className="text-ink-3">
                      {e.kind} · {e.delta >= 0 ? '+' : ''}
                      {e.delta} · Stand {e.balance}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-[12.5px] leading-snug text-ink-3">
            Zu dieser Karte sind kein Name, keine E-Mail-Adresse und keine Telefonnummer
            gespeichert.
          </p>

          <div className="border-t border-line pt-4">
            {confirming ? (
              <div className="space-y-3">
                <p className="text-[13px] leading-snug text-warn-ink">
                  Löscht die Karte samt Stempelstand, Buchungen und Geräteregistrierungen. Der
                  Pass bleibt im Wallet des Kunden stehen, lässt sich aber nicht mehr stempeln und
                  nicht mehr aktualisieren. Das ist endgültig.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="pass-delete-password">Zum Bestätigen dein Passwort</Label>
                  <Input
                    id="pass-delete-password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-invalid={deleteError !== null}
                    disabled={busy}
                  />
                  <FieldError>{deleteError}</FieldError>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={busy || password.length === 0}
                    onClick={remove}
                  >
                    {busy ? <Spinner /> : null}
                    Endgültig löschen
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                    Abbrechen
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
                Daten zu dieser Karte löschen
              </Button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-ink-3">{label}</dt>
      <dd className="text-right font-medium text-ink tabular-nums">{value}</dd>
    </>
  )
}
