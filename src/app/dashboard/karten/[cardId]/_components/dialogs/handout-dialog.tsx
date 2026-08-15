'use client'

import * as React from 'react'
import { Check, Copy, Nfc } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/misc'
import {
  disableHandoutAction,
  enableHandoutAction,
  getHandoutStateAction,
  updateHandoutStartStampsAction,
  type HandoutState,
} from '@/actions/handout'
import { useCardEditor } from '@/stores/card-editor-provider'

/**
 * The link that goes onto the NFC chips and the counter QR.
 *
 * One address for both: an NFC tag stores a URL and nothing else, so chip and printed code
 * are the same thing in two shapes. Everything the shop needs is on screen at once —
 * copy the URL for the chip, or print the code for the counter.
 */
export function HandoutDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const cardId = useCardEditor((s) => s.cardId)
  const stampGoal = useCardEditor((s) => s.design.stampGoal)

  const [state, setState] = React.useState<HandoutState | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState(false)
  const [confirmingOff, setConfirmingOff] = React.useState(false)

  const [startStamps, setStartStamps] = React.useState(0)
  const [startStampsBusy, setStartStampsBusy] = React.useState(false)
  const [startStampsSaved, setStartStampsSaved] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setError(null)
    setCopied(false)
    setConfirmingOff(false)
    void (async () => {
      const result = await getHandoutStateAction(cardId)
      if (result.success) {
        setState(result.data)
        setStartStamps(result.data.startStamps)
      } else {
        setError(result.error.message)
      }
    })()
  }, [open, cardId])

  const saveStartStamps = async (next: number) => {
    setStartStamps(next)
    setStartStampsBusy(true)
    setStartStampsSaved(false)
    const result = await updateHandoutStartStampsAction(cardId, next)
    if (!result.success) {
      setError(result.error.message)
    } else {
      setState((prev) => (prev ? { ...prev, startStamps: next } : prev))
      setStartStampsSaved(true)
    }
    setStartStampsBusy(false)
  }

  const enable = async () => {
    setBusy(true)
    setError(null)
    const result = await enableHandoutAction(cardId)
    if (result.success) {
      setState((prev) => (prev ? { ...prev, link: result.data, isPublished: true } : prev))
    } else {
      setError(result.error.message)
    }
    setBusy(false)
  }

  const disable = async () => {
    setBusy(true)
    setError(null)
    const result = await disableHandoutAction(cardId)
    if (result.success) setState((prev) => (prev ? { ...prev, link: null } : prev))
    else setError(result.error.message)
    setConfirmingOff(false)
    setBusy(false)
  }

  const copy = async () => {
    if (!state?.link) return
    await navigator.clipboard.writeText(state.link.url)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Karte ausgeben — NFC und QR</DialogTitle>
          <DialogDescription>
            Ein Link für beides. Jeder, der ihn öffnet, bekommt seine eigene Stempelkarte;
            beim zweiten Antippen wieder dieselbe.
          </DialogDescription>
        </DialogHeader>

        {state === null ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : state.link ? (
          <div className="space-y-4">
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={state.link.qrDataUrl}
                alt="QR-Code für die Kartenausgabe"
                className="size-[200px] rounded-lg border border-line bg-white p-2"
              />
            </div>

            <div className="flex gap-2">
              <Input readOnly value={state.link.url} onFocus={(e) => e.currentTarget.select()} />
              <Button variant="secondary" onClick={copy}>
                {copied ? <Check /> : <Copy />}
                {copied ? 'Kopiert' : 'Kopieren'}
              </Button>
            </div>

            <p className="text-[12px] leading-snug text-ink-3">
              Bisher ausgegeben: <strong className="text-ink-2">{state.link.issuedCount}</strong>
            </p>

            {state.kind === 'STAMP' ? (
              <div className="space-y-1.5">
                <label htmlFor="handout-start-stamps" className="text-[13px] font-medium text-ink">
                  Startstempel neuer Karten
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    id="handout-start-stamps"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={stampGoal}
                    value={startStamps}
                    className="w-24"
                    onChange={(e) => setStartStamps(Number(e.target.value))}
                    onBlur={(e) => {
                      const clamped = Math.min(
                        Math.max(0, Math.round(Number(e.target.value) || 0)),
                        stampGoal,
                      )
                      if (clamped !== state.startStamps) void saveStartStamps(clamped)
                      else setStartStamps(clamped)
                    }}
                  />
                  <span className="text-[12px] text-ink-3">von {stampGoal}</span>
                  {startStampsBusy ? <Spinner className="size-3.5" /> : null}
                  {!startStampsBusy && startStampsSaved ? (
                    <Check className="size-3.5 text-ok" />
                  ) : null}
                </div>
                <p className="text-[12px] leading-snug text-ink-3">
                  Jede neue Karte über diesen Link startet mit so vielen Stempeln — z. B. für
                  eine Anlaufaktion oder den Umstieg von Papierkarten. Bereits ausgegebene
                  Karten ändern sich dadurch nicht.
                </p>
              </div>
            ) : null}

            <div className="space-y-1.5 rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-[12px] leading-snug text-ink-2">
              <p className="font-medium text-ink">Chip beschreiben</p>
              <p>
                NTAG213-Sticker reichen. Mit der App „NFC Tools" die URL oben als
                <em> URL/URI</em> auf den Chip schreiben, einmal pro Aufkleber. iPhone ab XS
                und Android lesen ihn ohne App, direkt aus der Sperre heraus.
              </p>
            </div>

            {confirmingOff ? (
              <div className="space-y-2 rounded-lg border border-warn/40 bg-warn-soft px-3 py-2.5 text-[12px] leading-snug text-warn-ink">
                <p>
                  Nach dem Abschalten führt jeder bereits beschriebene Chip und jeder
                  gedruckte QR-Code ins Leere. Ein späteres Einschalten erzeugt eine{' '}
                  <strong>neue</strong> Adresse — die alten Aufkleber bleiben tot.
                  Ausgegebene Karten behalten ihre Stempel.
                </p>
                <div className="flex gap-2">
                  <Button variant="danger" size="sm" disabled={busy} onClick={disable}>
                    {busy ? <Spinner /> : null}
                    Trotzdem abschalten
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmingOff(false)}>
                    Abbrechen
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setConfirmingOff(true)}>
                Ausgabe abschalten
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[13px] leading-snug text-ink-2">
              Noch kein Ausgabe-Link. Beim Erzeugen entsteht eine feste Adresse für diese
              Karte, die auf Chips und Aufsteller kommt.
            </p>
            {!state.isPublished ? (
              <p className="rounded-lg border border-warn/40 bg-warn-soft px-3 py-2.5 text-[12px] leading-snug text-warn-ink">
                Diese Karte ist noch ein Entwurf. Erst veröffentlichen — sonst gäbe es
                nichts auszugeben.
              </p>
            ) : null}
            <Button variant="primary" disabled={busy || !state.isPublished} onClick={enable}>
              {busy ? <Spinner /> : <Nfc />}
              Ausgabe-Link erzeugen
            </Button>
          </div>
        )}

        {error ? (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
