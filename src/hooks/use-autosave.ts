'use client'

import * as React from 'react'
import { useStore } from 'zustand'
import { saveDraftAction } from '@/actions/card-design'
import { isDirty } from '@/stores/card-editor-store'
import { useCardEditorStore } from '@/stores/card-editor-provider'

const AUTOSAVE_DELAY_MS = 2000

/**
 * Autosave after two seconds of inactivity.
 *
 * Dirtiness is derived from a snapshot comparison rather than a flag, so undo/redo takes
 * part correctly: undoing back to the last saved state reads as clean and does not
 * trigger a pointless save, undoing away from it re-arms the timer.
 */
export function useAutosave(): void {
  const store = useCardEditorStore()
  const design = useStore(store, (s) => s.design)
  const savedSnapshot = useStore(store, (s) => s.savedSnapshot)

  const inFlight = React.useRef(false)
  const pending = React.useRef(false)

  const flush = React.useCallback(async () => {
    const state = store.getState()
    if (!isDirty(state)) return

    if (inFlight.current) {
      pending.current = true
      return
    }

    inFlight.current = true
    const attempted = state.design
    state.markSaving()

    try {
      const result = await saveDraftAction({ cardId: state.cardId, design: attempted })
      if (result.success) {
        store.getState().markSaved(attempted)
      } else {
        store.getState().markSaveError(result.error.message, result.error.fields)
      }
    } catch {
      store
        .getState()
        .markSaveError('Speichern fehlgeschlagen — Verbindung prüfen. Änderungen bleiben lokal erhalten.')
    } finally {
      inFlight.current = false
      if (pending.current) {
        pending.current = false
        void flush()
      }
    }
  }, [store])

  React.useEffect(() => {
    if (JSON.stringify(design) === savedSnapshot) return
    const timer = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [design, savedSnapshot, flush])

  // Do not let a browser tab close on top of unsaved work.
  React.useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!isDirty(store.getState())) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [store])
}
