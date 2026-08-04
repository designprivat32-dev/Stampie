'use client'

import * as React from 'react'
import { useTemporal } from '@/stores/card-editor-provider'

/**
 * Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z.
 *
 * Text inputs keep their native undo — inside a field the browser's own history is what
 * the user expects, and stealing it would make typing feel broken.
 */
export function useUndoShortcuts(): void {
  const { undo, redo } = useTemporal()

  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey
      if (!modifier || event.key.toLowerCase() !== 'z') return

      const target = event.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return
      }

      event.preventDefault()
      if (event.shiftKey) redo()
      else undo()
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo])
}
