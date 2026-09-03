import { describe, expect, it, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import * as React from 'react'
import { GoogleLoyaltyCard } from '@/app/dashboard/karten/[cardId]/_components/preview/google-loyalty-card'
import { GoogleLoyaltyCardBack } from '@/app/dashboard/karten/[cardId]/_components/preview/google-loyalty-card-back'
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
  it('shows the issuer name as the header and keeps the program name off the face', () => {
    const storeRef = { current: null as CardEditorStore | null }
    render(<Harness design={{ programName: 'Kaffee Stempelkarte' }} storeRef={storeRef} />)

    expect(screen.getByText('Testladen')).toBeTruthy()
    expect(screen.queryByText('Kaffee Stempelkarte')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Programmname' })).toBeNull()
  })

  it('prints the barcode alternateText under the code', () => {
    const storeRef = { current: null as CardEditorStore | null }
    render(<Harness storeRef={storeRef} />)
    expect(screen.getByText('SN-DEMO-0001')).toBeTruthy()
  })

  it('clicking the stamp label edits it live', () => {
    const storeRef = { current: null as CardEditorStore | null }
    render(<Harness design={{ stampLabel: 'STEMPEL' }} storeRef={storeRef} />)

    fireEvent.click(screen.getByRole('button', { name: 'Stempel-Bezeichnung' }))
    const input = screen.getByRole('textbox', { name: 'Stempel-Bezeichnung' })
    fireEvent.change(input, { target: { value: 'PUNKTE' } })
    expect(storeRef.current?.getState().design.stampLabel).toBe('PUNKTE')
  })

  it('never renders reward text on the front — Google only shows it in the details view', () => {
    const storeRef = { current: null as CardEditorStore | null }
    render(<Harness design={{ rewardText: '' }} storeRef={storeRef} />)
    expect(screen.queryByText('Belohnung')).toBeNull()

    act(() => {
      storeRef.current?.getState().patch({ rewardText: 'Gratis Kaffee' })
    })
    expect(screen.queryByText('Belohnung')).toBeNull()
    expect(screen.queryByText('Gratis Kaffee')).toBeNull()
  })

  it('shows stamp balance and goal — loyaltyPoints carries both', () => {
    const storeRef = { current: null as CardEditorStore | null }
    render(<Harness design={{ stampGoal: 10 }} storeRef={storeRef} />)
    // `buildLoyaltyObject` sendet "2/10" als String; die Vorschau muss dieselbe Zahl
    // zeigen, sonst widerspricht sie der Karte im Wallet des Kunden.
    expect(screen.getByText('2/10')).toBeTruthy()
  })

  it('keeps tier and account labels off the card face', () => {
    const storeRef = { current: null as CardEditorStore | null }
    render(
      <Harness
        design={{
          googleRewardsTierEnabled: true,
          rewardsTier: 'Gold',
          rewardsTierLabel: 'Stufe',
          accountNameLabel: 'Mitglied',
          accountIdLabel: 'Nr.',
        }}
        storeRef={storeRef}
      />,
    )
    expect(screen.queryByText('Gold')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Stufen-Name' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Label für Kontoinhaber' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Label für ID' })).toBeNull()
  })
})

describe('GoogleLoyaltyCardBack details view', () => {
  function BackHarness({
    design,
    storeRef,
  }: {
    design?: Partial<CardDesignInput>
    storeRef: { current: CardEditorStore | null }
  }) {
    const merged = { ...DEFAULT_CARD_DESIGN, ...design }
    return (
      <CardEditorProvider init={{ cardId: 'cloc00000000000000000001', design: merged }}>
        <Capture storeRef={storeRef} />
        <GoogleLoyaltyCardBack design={merged} />
      </CardEditorProvider>
    )
  }

  it('carries the fields Google moved off the card face', () => {
    const storeRef = { current: null as CardEditorStore | null }
    render(
      <BackHarness
        design={{
          rewardText: 'Jeder 10. Kaffee gratis',
          googleRewardsTierEnabled: true,
          rewardsTier: 'Gold',
          rewardsTierLabel: 'Stufe',
          accountNameLabel: 'Mitglied',
        }}
        storeRef={storeRef}
      />,
    )
    expect(screen.getByText('Jeder 10. Kaffee gratis')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Stufen-Name' }).textContent).toBe('Gold')
    expect(screen.getByRole('button', { name: 'Label für Kontoinhaber' }).textContent).toBe(
      'Mitglied',
    )
  })

  it('reward text alone is enough to fill the details view', () => {
    const storeRef = { current: null as CardEditorStore | null }
    render(<BackHarness design={{ rewardText: 'Gratis Kaffee', backFields: [] }} storeRef={storeRef} />)
    expect(screen.queryByText('Noch keine Felder auf der Rückseite.')).toBeNull()
    expect(screen.getByText('Belohnung')).toBeTruthy()
  })

  it('reward text is editable in place', () => {
    const storeRef = { current: null as CardEditorStore | null }
    render(<BackHarness design={{ rewardText: 'Gratis Kaffee' }} storeRef={storeRef} />)

    fireEvent.click(screen.getByRole('button', { name: 'Belohnungstext' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Belohnungstext' }), {
      target: { value: 'Gratis Tee' },
    })
    expect(storeRef.current?.getState().design.rewardText).toBe('Gratis Tee')
  })
})
