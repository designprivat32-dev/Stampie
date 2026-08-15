'use client'

import { create } from 'zustand'
import { temporal } from 'zundo'
import type { BackField, CardDesignInput, CardKind, GeoLocation } from '@/lib/cards/schema'
import type { StripTarget } from '@/lib/cards/render-strip'

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'
export type PreviewSide = 'front' | 'back'
export type PreviewTheme = 'light' | 'dark'

export interface CardEditorState {
  cardId: string
  /**
   * Which pass this card issues. Lives in the store rather than being passed down, because
   * stamp-specific controls sit in half a dozen unrelated components — a prop would have to
   * reach every one of them, and the ones it did not reach would silently keep offering
   * stamps on a coupon. Immutable for the lifetime of the editor: the kind is fixed at
   * creation.
   */
  kind: CardKind
  design: CardDesignInput

  /** JSON of the last successfully persisted design — the dirty check compares to this. */
  savedSnapshot: string
  saveState: SaveState
  saveError: string | null
  lastSavedAt: Date | null
  /** Server-side validation errors keyed by field path, filled after a rejected save. */
  fieldErrors: Record<string, string>

  previewPlatform: StripTarget
  previewSide: PreviewSide
  previewTheme: PreviewTheme
  simulatedStamps: number

  /**
   * assetId -> public URL. Seeded by the server on load and extended after each upload,
   * because the client cannot derive a storage URL from an asset id on its own.
   */
  assetUrls: Record<string, string>
  setAssetUrl: (assetId: string, url: string) => void

  // --- design mutations (all tracked by undo/redo)
  patch: (partial: Partial<CardDesignInput>) => void
  set: <K extends keyof CardDesignInput>(key: K, value: CardDesignInput[K]) => void
  replaceDesign: (design: CardDesignInput) => void

  addBackField: (field: BackField) => void
  updateBackField: (id: string, patch: Partial<BackField>) => void
  removeBackField: (id: string) => void
  reorderBackFields: (fromId: string, toId: string) => void

  addGeoLocation: (location: GeoLocation) => void
  updateGeoLocation: (id: string, patch: Partial<GeoLocation>) => void
  removeGeoLocation: (id: string) => void

  // --- non-design state (not tracked)
  setPreviewPlatform: (platform: StripTarget) => void
  setPreviewSide: (side: PreviewSide) => void
  setPreviewTheme: (theme: PreviewTheme) => void
  setSimulatedStamps: (n: number) => void

  markSaving: () => void
  markSaved: (snapshot: CardDesignInput) => void
  markSaveError: (message: string, fieldErrors?: Record<string, string>) => void
  clearFieldErrors: () => void
}

export interface CardEditorInit {
  cardId: string
  /** Defaults to the stamp card, which is what every card created before coupons is. */
  kind?: CardKind
  design: CardDesignInput
  assetUrls?: Record<string, string>
}

const snapshot = (design: CardDesignInput): string => JSON.stringify(design)

export const createCardEditorStore = (init: CardEditorInit) =>
  create<CardEditorState>()(
    temporal(
      (set, get) => ({
        cardId: init.cardId,
        kind: init.kind ?? 'STAMP',
        design: init.design,

        savedSnapshot: snapshot(init.design),
        saveState: 'idle',
        saveError: null,
        lastSavedAt: null,
        fieldErrors: {},

        assetUrls: init.assetUrls ?? {},
        setAssetUrl: (assetId, url) =>
          set((s) => ({ assetUrls: { ...s.assetUrls, [assetId]: url } })),

        previewPlatform: 'apple',
        previewSide: 'front',
        previewTheme: 'dark',
        // Half-full reads better in a sales conversation than an empty card.
        simulatedStamps: Math.min(init.design.stampGoal, Math.ceil(init.design.stampGoal * 0.6)),

        // Immutable throughout: every mutation returns a new object, never edits in place.
        patch: (partial) => set((s) => ({ design: { ...s.design, ...partial } })),
        set: (key, value) => set((s) => ({ design: { ...s.design, [key]: value } })),
        replaceDesign: (design) => set(() => ({ design })),

        addBackField: (field) =>
          set((s) => ({ design: { ...s.design, backFields: [...s.design.backFields, field] } })),

        updateBackField: (id, patch) =>
          set((s) => ({
            design: {
              ...s.design,
              backFields: s.design.backFields.map((f) =>
                f.id === id ? ({ ...f, ...patch } as BackField) : f,
              ),
            },
          })),

        removeBackField: (id) =>
          set((s) => ({
            design: { ...s.design, backFields: s.design.backFields.filter((f) => f.id !== id) },
          })),

        reorderBackFields: (fromId, toId) =>
          set((s) => {
            const list = s.design.backFields
            const from = list.findIndex((f) => f.id === fromId)
            const to = list.findIndex((f) => f.id === toId)
            if (from < 0 || to < 0 || from === to) return {}
            const next = [...list]
            const [moved] = next.splice(from, 1)
            if (!moved) return {}
            next.splice(to, 0, moved)
            return { design: { ...s.design, backFields: next } }
          }),

        addGeoLocation: (location) =>
          set((s) => ({ design: { ...s.design, geoLocations: [...s.design.geoLocations, location] } })),

        updateGeoLocation: (id, patch) =>
          set((s) => ({
            design: {
              ...s.design,
              geoLocations: s.design.geoLocations.map((g) => (g.id === id ? { ...g, ...patch } : g)),
            },
          })),

        removeGeoLocation: (id) =>
          set((s) => ({
            design: { ...s.design, geoLocations: s.design.geoLocations.filter((g) => g.id !== id) },
          })),

        setPreviewPlatform: (previewPlatform) => set(() => ({ previewPlatform })),
        setPreviewSide: (previewSide) => set(() => ({ previewSide })),
        setPreviewTheme: (previewTheme) => set(() => ({ previewTheme })),
        setSimulatedStamps: (n) =>
          set((s) => ({ simulatedStamps: Math.max(0, Math.min(s.design.stampGoal, Math.round(n))) })),

        markSaving: () => set(() => ({ saveState: 'saving', saveError: null })),
        markSaved: (saved) =>
          set(() => ({
            saveState: 'saved',
            saveError: null,
            fieldErrors: {},
            lastSavedAt: new Date(),
            savedSnapshot: snapshot(saved),
          })),
        markSaveError: (message, fieldErrors = {}) =>
          set(() => ({ saveState: 'error', saveError: message, fieldErrors })),
        clearFieldErrors: () => set(() => ({ fieldErrors: {} })),
      }),
      {
        // Only the design participates in undo/redo — flipping the preview to the back
        // side must not become a step in the history.
        partialize: (state) => ({ design: state.design }),
        limit: 100,
        equality: (a, b) => snapshot(a.design) === snapshot(b.design),
      },
    ),
  )

export type CardEditorStore = ReturnType<typeof createCardEditorStore>

/**
 * Dirty is derived, not stored: that way an undo back to the saved state correctly reads
 * as clean, and an undo away from it correctly re-arms autosave.
 */
export function isDirty(state: CardEditorState): boolean {
  return snapshot(state.design) !== state.savedSnapshot
}
