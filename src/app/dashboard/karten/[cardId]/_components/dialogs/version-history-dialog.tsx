'use client'

import * as React from 'react'
import { History, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/misc'
import { listVersionsAction, restoreVersionAction } from '@/actions/card-design'
import type { VersionSummary } from '@/lib/cards/repository'
import { useCardEditor, useTemporal } from '@/stores/card-editor-provider'

/**
 * Version history. Restoring writes the snapshot into the *draft* — the user then looks
 * at it in the preview and publishes deliberately, rather than silently swapping the card
 * out from under existing holders.
 */
export function VersionHistoryDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const cardId = useCardEditor((s) => s.cardId)
  const replaceDesign = useCardEditor((s) => s.replaceDesign)
  const markSaved = useCardEditor((s) => s.markSaved)
  const { clear } = useTemporal()

  const [versions, setVersions] = React.useState<VersionSummary[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [restoring, setRestoring] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setVersions(null)
    setError(null)
    void listVersionsAction(cardId).then((result) => {
      if (result.success) setVersions(result.data)
      else setError(result.error.message)
    })
  }, [open, cardId])

  const handleRestore = async (versionId: string) => {
    setRestoring(versionId)
    setError(null)
    try {
      const result = await restoreVersionAction({ cardId, versionId })
      if (!result.success) {
        setError(result.error.message)
        return
      }
      replaceDesign(result.data)
      markSaved(result.data)
      clear()
      onOpenChange(false)
    } catch {
      setError('Wiederherstellen fehlgeschlagen. Bitte erneut versuchen.')
    } finally {
      setRestoring(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Versionen</DialogTitle>
          <DialogDescription>
            Jede Veröffentlichung wird gespeichert. Wiederherstellen lädt die Version in den
            Entwurf — veröffentlicht wird sie erst mit einem weiteren Klick.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">
            {error}
          </p>
        ) : null}

        {versions === null && !error ? (
          <div className="flex items-center gap-2 py-6 text-[13px] text-ink-3">
            <Spinner />
            Versionen werden geladen…
          </div>
        ) : null}

        {versions?.length === 0 ? (
          <p className="flex items-center gap-2 rounded-lg border border-dashed border-line px-3 py-8 text-[13px] text-ink-3">
            <History className="size-4" />
            Diese Karte wurde noch nie veröffentlicht.
          </p>
        ) : null}

        {versions && versions.length > 0 ? (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {versions.map((version) => (
              <li key={version.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-ink">Version {version.version}</p>
                  <p className="text-[12px] text-ink-3">
                    {new Date(version.publishedAt).toLocaleString('de-DE', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                    {version.note ? ` · ${version.note}` : ''}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={restoring !== null}
                  onClick={() => handleRestore(version.id)}
                >
                  {restoring === version.id ? <Spinner /> : <RotateCcw />}
                  Wiederherstellen
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
