'use client'

import * as React from 'react'
import { AlertTriangle, Check, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/misc'
import { affectedPassCountAction, publishAction } from '@/actions/card-design'
import { contrastRatioForDesign, CONTRAST_BLOCK_THRESHOLD } from '@/lib/cards/schema'
import { useCardEditor } from '@/stores/card-editor-provider'

/**
 * Publishing changes the card for every customer who already carries it, so the dialog
 * leads with that number rather than burying it.
 */
export function PublishDialog({
  open,
  onOpenChange,
  onPublished,
  isFirstPublish,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPublished: (version: number) => void
  /** First release versus a change to something already in customers' wallets. */
  isFirstPublish: boolean
}) {
  const cardId = useCardEditor((s) => s.cardId)
  const design = useCardEditor((s) => s.design)

  const [affected, setAffected] = React.useState<number | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [errors, setErrors] = React.useState<string[]>([])
  const [confirmContrast, setConfirmContrast] = React.useState(false)

  const ratio = contrastRatioForDesign(design)
  const lowContrast = ratio < CONTRAST_BLOCK_THRESHOLD

  React.useEffect(() => {
    if (!open) return
    setErrors([])
    setConfirmContrast(false)
    setAffected(null)
    void affectedPassCountAction(cardId).then((result) => {
      if (result.success) setAffected(result.data)
    })
  }, [open, cardId])

  const handlePublish = async () => {
    setBusy(true)
    setErrors([])
    try {
      const result = await publishAction({
        cardId,
        design,
        confirmLowContrast: confirmContrast,
      })
      if (!result.success) {
        const fields = result.error.fields
        setErrors(fields ? [...new Set(Object.values(fields))] : [result.error.message])
        return
      }
      onPublished(result.data.version)
      onOpenChange(false)
    } catch {
      setErrors([`${isFirstPublish ? 'Veröffentlichen' : 'Aktualisieren'} fehlgeschlagen. Bitte erneut versuchen.`])
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isFirstPublish ? 'Karte veröffentlichen' : 'Karte aktualisieren'}</DialogTitle>
          <DialogDescription>
            Die Änderungen gelten sofort — auch für Karten, die bereits ausgegeben wurden.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-3 rounded-lg border border-warn/40 bg-warn-soft px-3 py-3 text-warn-ink">
          <Users className="mt-0.5 size-4 shrink-0" />
          <div className="text-[13px] leading-snug">
            {affected === null ? (
              <span className="text-ink-3">Betroffene Karten werden ermittelt…</span>
            ) : affected === 0 ? (
              <>Es sind noch keine Karten ausgegeben. Die Veröffentlichung betrifft niemanden.</>
            ) : (
              <>
                <strong className="tabular-nums">{affected}</strong>{' '}
                {affected === 1 ? 'ausgegebene Karte ändert' : 'ausgegebene Karten ändern'} sich
                sofort auf den Handys der Kunden.
              </>
            )}
          </div>
        </div>

        {lowContrast ? (
          <label className="flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger-soft px-3 py-3 text-danger">
            <input
              type="checkbox"
              data-slot="control"
              checked={confirmContrast}
              onChange={(e) => setConfirmContrast(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-current"
            />
            <span className="text-[13px] leading-snug">
              Der Kontrast liegt bei {ratio.toFixed(2)}:1 und damit unter 3:1. Ich veröffentliche
              trotzdem und weiß, dass die Karte in der Sonne schwer lesbar ist.
            </span>
          </label>
        ) : null}

        {errors.length > 0 ? (
          <ul className="space-y-1.5 rounded-lg border border-danger/30 bg-danger-soft px-3 py-3">
            {errors.map((message) => (
              <li key={message} className="flex items-start gap-2 text-[13px] leading-snug text-danger">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                {message}
              </li>
            ))}
          </ul>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Abbrechen
          </Button>
          <Button
            variant="primary"
            onClick={handlePublish}
            disabled={busy || (lowContrast && !confirmContrast)}
          >
            {busy ? <Spinner /> : <Check />}
            {isFirstPublish ? 'Jetzt veröffentlichen' : 'Jetzt aktualisieren'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
