import { describe, expect, it } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import * as React from 'react'
import { afterEach } from 'vitest'
import { ContrastWarning } from '@/app/dashboard/karten/[cardId]/_components/contrast-warning'
import { ColorField } from '@/app/dashboard/karten/[cardId]/_components/color-field'
import { PublishDialog } from '@/app/dashboard/karten/[cardId]/_components/dialogs/publish-dialog'
import { CardEditorProvider, useCardEditorStore } from '@/stores/card-editor-provider'
import { DEFAULT_CARD_DESIGN } from '@/lib/cards/defaults'
import { contrastRatio } from '@/lib/color/contrast'
import type { CardDesignInput } from '@/lib/cards/schema'
import type { CardEditorStore } from '@/stores/card-editor-store'

afterEach(cleanup)

function Harness({
  design,
  storeRef,
  children,
}: {
  design?: Partial<CardDesignInput>
  storeRef?: { current: CardEditorStore | null }
  children: React.ReactNode
}) {
  return (
    <CardEditorProvider
      init={{ cardId: 'cloc00000000000000000001', design: { ...DEFAULT_CARD_DESIGN, ...design } }}
    >
      <Capture storeRef={storeRef} />
      {children}
    </CardEditorProvider>
  )
}

function Capture({ storeRef }: { storeRef?: { current: CardEditorStore | null } }) {
  const store = useCardEditorStore()
  if (storeRef) storeRef.current = store
  return null
}

describe('ContrastWarning', () => {
  it('collapses to a single line when both pairs pass', () => {
    render(
      <Harness>
        <ContrastWarning />
      </Harness>,
    )
    // #ffffff on #1a1a1a — nothing to act on, so no rows and no ratios.
    expect(screen.getByText('Kontrast in Ordnung')).toBeTruthy()
    expect(screen.queryByText(/:1$/)).toBeNull()
    expect(screen.queryByText('Text auf Hintergrund')).toBeNull()
  })

  it('warns on neon pink over white and offers the fix', () => {
    render(
      <Harness design={{ foregroundColor: '#ff2fb9', backgroundColor: '#ffffff' }}>
        <ContrastWarning />
      </Harness>,
    )
    expect(screen.getByText('3.30:1')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /Korrigieren/ }).length).toBeGreaterThan(0)
  })

  it('blocks-level message appears below 3:1', () => {
    render(
      <Harness design={{ foregroundColor: '#cccccc', backgroundColor: '#ffffff' }}>
        <ContrastWarning />
      </Harness>,
    )
    expect(screen.getByText(/Veröffentlichen nur mit Bestätigung/)).toBeTruthy()
  })

  it('"Automatisch korrigieren" actually reaches 4.5:1', () => {
    const storeRef = { current: null as CardEditorStore | null }
    render(
      <Harness design={{ foregroundColor: '#ff2fb9', backgroundColor: '#ffffff' }} storeRef={storeRef}>
        <ContrastWarning />
      </Harness>,
    )

    const buttons = screen.getAllByRole('button', { name: /Korrigieren/ })
    fireEvent.click(buttons[0]!)

    const design = storeRef.current!.getState().design
    expect(design.foregroundColor).not.toBe('#ff2fb9')
    expect(contrastRatio(design.foregroundColor, design.backgroundColor)).toBeGreaterThanOrEqual(4.5)
  })

  it('checks the label colour too — the more common real-world failure', () => {
    render(
      <Harness
        design={{ foregroundColor: '#000000', backgroundColor: '#ffffff', labelColor: '#dddddd' }}
      >
        <ContrastWarning />
      </Harness>,
    )
    expect(screen.getByText('Label auf Hintergrund')).toBeTruthy()
    // Label problems warn, they never block.
    expect(screen.queryByText(/Veröffentlichen nur mit Bestätigung/)).toBeNull()
  })
})

describe('ColorField', () => {
  it('accepts a pasted hex value', () => {
    const values: string[] = []
    render(
      <Harness>
        <ColorField
          id="test-color"
          label="Hintergrundfarbe"
          value="#1a1a1a"
          onChange={(next: string) => values.push(next)}
        />
      </Harness>,
    )

    const input = screen.getByLabelText('Hintergrundfarbe') as HTMLInputElement
    fireEvent.change(input, { target: { value: '#8C1C13' } })
    expect(values).toContain('#8c1c13')
  })

  it('shows an error for an invalid value instead of committing it', () => {
    const values: string[] = []
    render(
      <Harness>
        <ColorField
          id="test-color"
          label="Hintergrundfarbe"
          value="#1a1a1a"
          onChange={(next: string) => values.push(next)}
        />
      </Harness>,
    )

    fireEvent.change(screen.getByLabelText('Hintergrundfarbe'), { target: { value: 'rot' } })
    expect(values).toHaveLength(0)
    expect(screen.getByRole('alert').textContent).toContain('#rrggbb')
  })

  it('offers a keyboard-reachable hex field alongside the native picker', () => {
    render(
      <Harness>
        <ColorField id="test-color" label="Textfarbe" value="#ffffff" onChange={() => {}} />
      </Harness>,
    )
    expect((screen.getByLabelText('Textfarbe') as HTMLInputElement).type).toBe('text')
    expect((screen.getByLabelText('Textfarbe — Farbwähler') as HTMLInputElement).type).toBe('color')
  })
})

/**
 * First release and later change are different acts: the first hands the card to customers
 * at all, every later one reaches into passes already sitting in wallets. The button says
 * which of the two it is, and the dialog behind it has to agree — a button reading
 * "Aktualisieren" that opens "Karte veröffentlichen" reads like the wrong dialog opened.
 */
describe('publish dialog wording', () => {
  it('offers to publish while the card has never been released', () => {
    render(
      <Harness>
        <PublishDialog open onOpenChange={() => {}} onPublished={() => {}} isFirstPublish />
      </Harness>,
    )
    expect(screen.getByText('Karte veröffentlichen')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Jetzt veröffentlichen' })).toBeTruthy()
  })

  it('offers to update once a version is out', () => {
    render(
      <Harness>
        <PublishDialog
          open
          onOpenChange={() => {}}
          onPublished={() => {}}
          isFirstPublish={false}
        />
      </Harness>,
    )
    expect(screen.getByText('Karte aktualisieren')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Jetzt aktualisieren' })).toBeTruthy()
  })
})
