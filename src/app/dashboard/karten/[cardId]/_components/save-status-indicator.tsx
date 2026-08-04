'use client'

import { AlertTriangle, Check, Cloud } from 'lucide-react'
import { Spinner } from '@/components/ui/misc'
import { isDirty } from '@/stores/card-editor-store'
import { useCardEditor } from '@/stores/card-editor-provider'

export function SaveStatusIndicator() {
  const saveState = useCardEditor((s) => s.saveState)
  const saveError = useCardEditor((s) => s.saveError)
  const lastSavedAt = useCardEditor((s) => s.lastSavedAt)
  const dirty = useCardEditor(isDirty)

  if (saveState === 'error') {
    return (
      <span className="flex items-center gap-1.5 text-[12px] text-danger" role="status">
        <AlertTriangle className="size-3.5" />
        {saveError ?? 'Nicht gespeichert'}
      </span>
    )
  }

  if (saveState === 'saving') {
    return (
      <span className="flex items-center gap-1.5 text-[12px] text-ink-3" role="status">
        <Spinner className="size-3.5" />
        Speichert…
      </span>
    )
  }

  if (dirty) {
    return (
      <span className="flex items-center gap-1.5 text-[12px] text-ink-3" role="status">
        <Cloud className="size-3.5" />
        Nicht gespeicherte Änderungen
      </span>
    )
  }

  return (
    <span className="flex items-center gap-1.5 text-[12px] text-ink-3" role="status">
      <Check className="size-3.5 text-ok" />
      Gespeichert
      {lastSavedAt ? (
        <span className="tabular-nums">
          {lastSavedAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
        </span>
      ) : null}
    </span>
  )
}
