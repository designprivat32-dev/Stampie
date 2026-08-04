'use client'

import * as React from 'react'
import { useStore } from 'zustand'
import {
  createCardEditorStore,
  type CardEditorInit,
  type CardEditorState,
  type CardEditorStore,
} from './card-editor-store'

const CardEditorContext = React.createContext<CardEditorStore | null>(null)

export function CardEditorProvider({
  init,
  children,
}: {
  init: CardEditorInit
  children: React.ReactNode
}) {
  // One store per mounted editor, created lazily so it survives re-renders.
  const storeRef = React.useRef<CardEditorStore | null>(null)
  if (!storeRef.current) storeRef.current = createCardEditorStore(init)

  return <CardEditorContext.Provider value={storeRef.current}>{children}</CardEditorContext.Provider>
}

export function useCardEditorStore(): CardEditorStore {
  const store = React.useContext(CardEditorContext)
  if (!store) throw new Error('useCardEditorStore must be used inside <CardEditorProvider>')
  return store
}

export function useCardEditor<T>(selector: (state: CardEditorState) => T): T {
  return useStore(useCardEditorStore(), selector)
}

/** Undo/redo handles from the zundo temporal store. */
export function useTemporal() {
  const store = useCardEditorStore()
  const [state, setState] = React.useState(() => {
    const t = store.temporal.getState()
    return { pastStates: t.pastStates.length, futureStates: t.futureStates.length }
  })

  React.useEffect(
    () =>
      store.temporal.subscribe((t) =>
        setState({ pastStates: t.pastStates.length, futureStates: t.futureStates.length }),
      ),
    [store],
  )

  return {
    canUndo: state.pastStates > 0,
    canRedo: state.futureStates > 0,
    undo: React.useCallback(() => store.temporal.getState().undo(), [store]),
    redo: React.useCallback(() => store.temporal.getState().redo(), [store]),
    clear: React.useCallback(() => store.temporal.getState().clear(), [store]),
  }
}
