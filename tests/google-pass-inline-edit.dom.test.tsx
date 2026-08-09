import { describe, expect, it, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import * as React from 'react'
import { GoogleLoyaltyCard } from '@/app/dashboard/karten/[cardId]/_components/preview/google-loyalty-card'
import { CardEditorProvider, useCardEditorStore } from '@/stores/card-editor-provider'
import { DEFAULT_CARD_DESIGN } from '@/lib/cards/defaults'
import type { CardDesignInput } from '@/lib/cards/schema'
import type { CardEditorStore } from '@/stores/card-editor-store'

afterEach(cleanup)

function Harness({
  design,
  storeRef,
}: {
  design?: Partial<CardDesignInput>
  storeRef: { current: CardEditorStore | null }
}) {
  return (
    <CardEditorProvider
      init={{ cardId: 'cloc00000000000000000001', design: { ...DEFAULT_CARD_DESIGN, ...design } }}
    >
      <Capture storeRef={storeRef} />
      <GoogleLoyaltyCard
        design={{ ...DEFAULT_CARD_DESIGN, ...design }}
        cardId="cloc00000000000000000001"
        currentStamps={2}
        logoUrl={null}
        organizationName="Testladen"
      />
    </CardEditorProvider>
  )
}

function Capture({ storeRef }: { storeRef: { current: CardEditorStore | null } }) {
  const store = useCardEditorStore()
  storeRef.current = store
  return null
}

describe('GoogleLoyaltyCard inline edit', () => {
  it('clicking the program name turns it into an input and typing patches the store', () => {
    const storeRef = { current: null as CardEditorStore | null }
    render(<Harness design={{ programName: 'Kaffee Stempelkarte' }} storeRef={storeRef} />)

    const nameButton = screen.getByRole('button', { name: 'Programmname' })
    expect(nameButton.textContent).toBe('Kaffee Stempelkarte')

    fireEvent.click(nameButton)
    const input = screen.getByRole('textbox', { name: 'Programmname' }) as HTMLInputElement
    expect(input.value).toBe('Kaffee Stempelkarte')

    fireEvent.change(input, { target: { value: 'Bäckerei Stempelkarte' } })
    expect(storeRef.current?.getState().design.programName).toBe('Bäckerei Stempelkarte')

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByRole('button', { name: 'Programmname' }).textContent).toBe(
      'Bäckerei Stempelkarte',
    )
  })

  it('clicking the stamp label edits it live', () => {
    const storeRef = { current: null as CardEditorStore | null }
    render(<Harness design={{ stampLabel: 'STEMPEL' }} storeRef={storeRef} />)

    fireEvent.click(screen.getByRole('button', { name: 'Stempel-Bezeichnung' }))
    const input = screen.getByRole('textbox', { name: 'Stempel-Bezeichnung' })
    fireEvent.change(input, { target: { value: 'PUNKTE' } })
    expect(storeRef.current?.getState().design.stampLabel).toBe('PUNKTE')
  })

  it('reward text block is hidden until text exists, then becomes editable', () => {
    const storeRef = { current: null as CardEditorStore | null }
    render(<Harness design={{ rewardText: '' }} storeRef={storeRef} />)
    expect(screen.queryByText('Belohnung')).toBeNull()

    act(() => {
      storeRef.current?.getState().patch({ rewardText: 'Gratis Kaffee' })
    })
    expect(screen.getByText('Belohnung')).toBeTruthy()
  })
})
