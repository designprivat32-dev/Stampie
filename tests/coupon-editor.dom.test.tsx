import { describe, expect, it, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import * as React from 'react'
import { EditorTabs } from '@/app/dashboard/karten/[cardId]/_components/editor-tabs'
import { PreviewControls } from '@/app/dashboard/karten/[cardId]/_components/preview/preview-controls'
import { CardEditorProvider } from '@/stores/card-editor-provider'
import { TooltipProvider } from '@/components/ui/misc'
import { DEFAULT_CARD_DESIGN } from '@/lib/cards/defaults'
import type { CardKind } from '@/lib/cards/schema'
import type { CustomerSummary } from '@/types/customer'

afterEach(cleanup)

// Radix's Slider measures itself; jsdom has no ResizeObserver. Only the stamp path renders
// one, and the assertions here are about which controls exist, not their geometry.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

const customer: CustomerSummary = {
  id: 'cseedorg00000000000000001',
  name: 'Café Nord',
  street: null,
  postalCode: null,
  city: null,
  phone: null,
  website: null,
  email: null,
  imprintUrl: null,
  privacyUrl: null,
  latitude: null,
  longitude: null,
  openingHours: [],
}

function Editor({ kind }: { kind: CardKind }) {
  return (
    <CardEditorProvider init={{ cardId: 'cloc00000000000000000001', kind, design: DEFAULT_CARD_DESIGN }}>
      {/* Platform badges render tooltips, which the real shell also provides. */}
      <TooltipProvider>
        <EditorTabs customer={customer} />
        <PreviewControls onExport={async () => {}} />
      </TooltipProvider>
    </CardEditorProvider>
  )
}

/**
 * Stamp controls are scattered across four unrelated components, so hiding one tab is not
 * enough — this renders the whole editor surface at once and asserts a coupon offers no
 * stamp anything. It exists because exactly that regression shipped once.
 */
describe('editor for a coupon card', () => {
  const STAMP_CONTROLS = [
    'Stempel bis zur Belohnung',
    'Label für den Stempelstand',
    'Stempel simulieren',
    'Hintergrundbild',
    'Programmname',
  ]

  it.each(STAMP_CONTROLS)('does not offer "%s"', (labelText) => {
    render(<Editor kind="COUPON" />)
    expect(screen.queryByText(labelText)).toBeNull()
  })

  it('has no tab named Stempel', () => {
    render(<Editor kind="COUPON" />)
    expect(screen.queryByRole('tab', { name: 'Stempel' })).toBeNull()
  })

  // The tab is gone for every card kind now, not just for coupons.
  it('has no Google Wallet tab', () => {
    render(<Editor kind="COUPON" />)
    expect(screen.queryByRole('tab', { name: 'Google Wallet' })).toBeNull()
  })

  it('leaves exactly the four tabs whose fields reach an offer pass', () => {
    render(<Editor kind="COUPON" />)
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Branding',
      'Gutschein',
      'Texte',
      'Erweitert',
    ])
  })

  it('offers the coupon tab', () => {
    render(<Editor kind="COUPON" />)
    expect(screen.getByRole('tab', { name: 'Gutschein' })).toBeTruthy()
  })

  it('keeps branding, texts and the advanced tab — those apply to both kinds', () => {
    render(<Editor kind="COUPON" />)
    for (const name of ['Branding', 'Texte', 'Erweitert']) {
      expect(screen.getByRole('tab', { name })).toBeTruthy()
    }
  })
})

describe('editor for a stamp card', () => {
  it('still offers every stamp control', () => {
    render(<Editor kind="STAMP" />)
    expect(screen.getByRole('tab', { name: 'Stempel' })).toBeTruthy()
    expect(screen.getByText('Stempel simulieren')).toBeTruthy()
  })

  it('reaches the coupon tab too — a full card can hand one out', () => {
    render(<Editor kind="STAMP" />)
    expect(screen.getByRole('tab', { name: 'Gutschein' })).toBeTruthy()
  })

  it('has no Google Wallet tab either — it was removed from the editor', () => {
    render(<Editor kind="STAMP" />)
    expect(screen.queryByRole('tab', { name: 'Google Wallet' })).toBeNull()
  })
})
