import { describe, expect, it, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import * as React from 'react'
import { EditorPanel } from '@/app/dashboard/karten/[cardId]/_components/editor-panel'
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
        <EditorPanel customer={customer} onOpenTemplates={() => {}} />
        <PreviewControls onExport={async () => {}} />
      </TooltipProvider>
    </CardEditorProvider>
  )
}

/**
 * Stamp controls are scattered across four unrelated components, and the editor is now one
 * long page — every section renders at once, with no tab left to hide behind. That makes
 * this the load-bearing test for coupons: if a stamp control leaks in, the shop sees it.
 * It exists because exactly that regression shipped once.
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

  it('shows no stamp section at all', () => {
    render(<Editor kind="COUPON" />)
    expect(screen.queryByText('Anzahl Stempel')).toBeNull()
    expect(screen.queryByText('Stempel-Symbol')).toBeNull()
  })

  it('still groups what a coupon does have', () => {
    render(<Editor kind="COUPON" />)
    for (const heading of ['Pflichtangaben', 'Gestaltung', 'Erweitert']) {
      expect(screen.getByText(heading)).toBeTruthy()
    }
  })
})

describe('editor for a stamp card', () => {
  it('still offers every stamp control', () => {
    render(<Editor kind="STAMP" />)
    expect(screen.getByText('Anzahl Stempel')).toBeTruthy()
    expect(screen.getByText('Stempel simulieren')).toBeTruthy()
  })

  it('reaches the coupon settings too — a full card can hand one out', () => {
    render(<Editor kind="STAMP" />)
    expect(screen.getByText('Belohnung als Gutschein')).toBeTruthy()
  })

  it('has no Google Wallet section left', () => {
    render(<Editor kind="STAMP" />)
    // Only the section is gone. Platform badges still name the wallet, and should — they
    // tell the shop which setting reaches which pass.
    expect(screen.queryByRole('heading', { name: 'Google Wallet' })).toBeNull()
  })
})

/**
 * The point of the split: what publishing demands sits at the top, what only decorates sits
 * below, and the settings a shop touches once a year are folded away until asked for.
 */
describe('the long editor page', () => {
  it('keeps the advanced settings collapsed until opened', () => {
    render(<Editor kind="STAMP" />)

    expect(screen.queryByText('Barcode')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Erweitert/ }))
    expect(screen.getByText('Barcode')).toBeTruthy()
  })

  it('keeps messaging out of the designer entirely', () => {
    render(<Editor kind="STAMP" />)
    fireEvent.click(screen.getByRole('button', { name: /Erweitert/ }))

    // Writing to customers is running the card, not designing it — it lives in the card
    // overview, where a card that nobody holds does not offer it at all.
    expect(screen.queryByRole('button', { name: /Nachricht/ })).toBeNull()
  })

  it('puts the required things above the decorative ones', () => {
    render(<Editor kind="STAMP" />)
    const order = document.body.textContent ?? ''

    expect(order.indexOf('Pflichtangaben')).toBeLessThan(order.indexOf('Gestaltung'))
    expect(order.indexOf('Gestaltung')).toBeLessThan(order.indexOf('Erweitert'))
  })
})

/**
 * Der Hauptschalter der Standort-Benachrichtigung.
 *
 * Ohne ihn war „aus" gleichbedeutend mit „alle Standorte löschen" — wer die Karte im
 * Winter nicht am Sperrbildschirm haben wollte, musste im Frühjahr jede Koordinate neu
 * eintippen. Der Schalter trennt beides.
 */
describe('die Standort-Benachrichtigung', () => {
  const openAdvanced = () => {
    render(<Editor kind="STAMP" />)
    fireEvent.click(screen.getByRole('button', { name: /Erweitert/ }))
    return screen.getByRole('switch', { name: 'Standort-Benachrichtigung' })
  }

  it('blendet den Standort-Editor aus, wenn sie abgeschaltet wird', () => {
    const toggle = openAdvanced()
    expect(screen.getByRole('button', { name: /Standort/ })).toBeTruthy()

    fireEvent.click(toggle)

    expect(screen.queryByRole('button', { name: /Standort hinzufügen/ })).toBeNull()
    expect(screen.getByText(/Kunden in der Nähe bekommen die Karte nicht/)).toBeTruthy()
  })

  it('legt beim Einschalten den ersten Standort an, statt „an" zu sagen und nichts zu tun', () => {
    const toggle = openAdvanced()
    expect(screen.queryAllByLabelText('Bezeichnung des Standorts')).toHaveLength(0)

    fireEvent.click(toggle)
    fireEvent.click(toggle)

    const labels = screen.getAllByLabelText('Bezeichnung des Standorts')
    expect(labels).toHaveLength(1)
    expect((labels[0] as HTMLInputElement).value).toBe('Café Nord')
  })
})

/**
 * The template picker lost its place in the header. It overwrites colours, symbol and texts
 * at once, so it sits under Erweitert now — reachable, but not next to the fields it would
 * overwrite, and only where a template means anything.
 */
describe('the template picker', () => {
  it('waits under Erweitert on a stamp card', () => {
    const onOpenTemplates = vi.fn()
    render(
      <CardEditorProvider
        init={{ cardId: 'cloc00000000000000000001', kind: 'STAMP', design: DEFAULT_CARD_DESIGN }}
      >
        <TooltipProvider>
          <EditorPanel customer={customer} onOpenTemplates={onOpenTemplates} />
        </TooltipProvider>
      </CardEditorProvider>,
    )

    expect(screen.queryByRole('button', { name: /Vorlage wählen/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Erweitert/ }))
    fireEvent.click(screen.getByRole('button', { name: /Vorlage wählen/ }))
    expect(onOpenTemplates).toHaveBeenCalledTimes(1)
  })

  it('is absent for a coupon, which no template describes', () => {
    render(
      <CardEditorProvider
        init={{ cardId: 'cloc00000000000000000001', kind: 'COUPON', design: DEFAULT_CARD_DESIGN }}
      >
        <TooltipProvider>
          <EditorPanel customer={customer} onOpenTemplates={() => {}} />
        </TooltipProvider>
      </CardEditorProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /Erweitert/ }))
    expect(screen.queryByRole('button', { name: /Vorlage wählen/ })).toBeNull()
  })
})
