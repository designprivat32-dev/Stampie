import { describe, expect, it } from 'vitest'
import { createCardEditorStore, isDirty } from '@/stores/card-editor-store'
import { DEFAULT_CARD_DESIGN } from '@/lib/cards/defaults'
import { stripPreviewUrl } from '@/lib/cards/preview-url'

const makeStore = () =>
  createCardEditorStore({ cardId: 'cloc00000000000000000001', design: { ...DEFAULT_CARD_DESIGN } })

describe('card editor store', () => {
  it('starts clean', () => {
    const store = makeStore()
    expect(isDirty(store.getState())).toBe(false)
  })

  it('patching marks the design dirty', () => {
    const store = makeStore()
    store.getState().patch({ programName: 'Kaffeekarte' })
    expect(store.getState().design.programName).toBe('Kaffeekarte')
    expect(isDirty(store.getState())).toBe(true)
  })

  it('never mutates the previous design object', () => {
    const store = makeStore()
    const before = store.getState().design
    store.getState().patch({ stampGoal: 12 })
    expect(before.stampGoal).toBe(10)
    expect(store.getState().design).not.toBe(before)
  })

  it('markSaved clears the dirty flag', () => {
    const store = makeStore()
    store.getState().patch({ programName: 'A' })
    store.getState().markSaved(store.getState().design)
    expect(isDirty(store.getState())).toBe(false)
  })

  describe('undo/redo', () => {
    it('reverts and reapplies a change', () => {
      const store = makeStore()
      store.getState().patch({ programName: 'Kaffeekarte' })
      store.temporal.getState().undo()
      expect(store.getState().design.programName).toBe('')
      store.temporal.getState().redo()
      expect(store.getState().design.programName).toBe('Kaffeekarte')
    })

    it('undoing back to the saved state reads as clean again', () => {
      const store = makeStore()
      store.getState().patch({ stampGoal: 15 })
      store.getState().markSaved(store.getState().design)
      store.getState().patch({ stampGoal: 20 })
      expect(isDirty(store.getState())).toBe(true)

      store.temporal.getState().undo()
      expect(store.getState().design.stampGoal).toBe(15)
      // Derived dirtiness is what makes this correct — a boolean flag would stay true.
      expect(isDirty(store.getState())).toBe(false)
    })

    it('does not track preview toggles', () => {
      const store = makeStore()
      store.getState().setPreviewPlatform('google')
      store.getState().setPreviewSide('back')
      store.getState().setSimulatedStamps(3)
      expect(store.temporal.getState().pastStates).toHaveLength(0)
      expect(isDirty(store.getState())).toBe(false)
    })
  })

  describe('back fields', () => {
    it('adds, updates, reorders and removes immutably', () => {
      const store = makeStore()
      const s = () => store.getState()

      s().addBackField({ id: 'a', type: 'text', label: 'A', value: '1' })
      s().addBackField({ id: 'b', type: 'text', label: 'B', value: '2' })
      s().addBackField({ id: 'c', type: 'text', label: 'C', value: '3' })
      expect(s().design.backFields.map((f) => f.id)).toEqual(['a', 'b', 'c'])

      s().updateBackField('b', { value: 'changed' })
      expect(s().design.backFields[1]!.value).toBe('changed')

      s().reorderBackFields('c', 'a')
      expect(s().design.backFields.map((f) => f.id)).toEqual(['c', 'a', 'b'])

      s().removeBackField('a')
      expect(s().design.backFields.map((f) => f.id)).toEqual(['c', 'b'])
    })

    it('ignores a reorder with an unknown id', () => {
      const store = makeStore()
      store.getState().addBackField({ id: 'a', type: 'text', label: 'A', value: '' })
      store.getState().reorderBackFields('a', 'nope')
      expect(store.getState().design.backFields.map((f) => f.id)).toEqual(['a'])
    })
  })

  it('clamps the simulated stamp count to the goal', () => {
    const store = makeStore()
    store.getState().setSimulatedStamps(99)
    expect(store.getState().simulatedStamps).toBe(10)
    store.getState().setSimulatedStamps(-5)
    expect(store.getState().simulatedStamps).toBe(0)
  })
})

describe('stripPreviewUrl', () => {
  const base = { ...DEFAULT_CARD_DESIGN, backgroundColor: '#3b2418', foregroundColor: '#fdf6ec' }

  it('carries every render-relevant field', () => {
    const url = stripPreviewUrl(base, { cardId: 'cloc1', currentStamps: 6 })
    const params = new URLSearchParams(url.split('?')[1])
    expect(params.get('card')).toBe('cloc1')
    expect(params.get('n')).toBe('10')
    expect(params.get('s')).toBe('6')
    expect(params.get('fg')).toBe('fdf6ec')
    expect(params.get('bg')).toBe('3b2418')
    expect(params.get('icon')).toBe('coffee')
    expect(params.get('t')).toBe('apple')
  })

  it('gives a different URL whenever the pixels would change', () => {
    const a = stripPreviewUrl(base, { cardId: 'l', currentStamps: 4 })
    const b = stripPreviewUrl({ ...base, backgroundColor: '#000000' }, { cardId: 'l', currentStamps: 4 })
    expect(a).not.toBe(b)
    expect(new URLSearchParams(a.split('?')[1]).get('v')).not.toBe(
      new URLSearchParams(b.split('?')[1]).get('v'),
    )
  })

  it('gives the same URL for a change that does not affect the strip', () => {
    const a = stripPreviewUrl(base, { cardId: 'l', currentStamps: 4 })
    const b = stripPreviewUrl({ ...base, programName: 'anders' }, { cardId: 'l', currentStamps: 4 })
    expect(a).toBe(b)
  })

  it('clamps the stamp count into the URL', () => {
    const url = stripPreviewUrl(base, { cardId: 'l', currentStamps: 999 })
    expect(new URLSearchParams(url.split('?')[1]).get('s')).toBe('10')
  })
})
