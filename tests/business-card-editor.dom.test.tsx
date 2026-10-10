import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'
import type { BusinessEditorData } from '@/lib/business-cards/editor-service'

/**
 * Der Visitenkarten-Editor im Browser: alles mit einem Knopf speichern, und die Vorschau
 * folgt dem, was eingetippt wird.
 */

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }))

const saveBusinessCardAction = vi.fn()
vi.mock('@/actions/business-cards', () => ({
  saveBusinessCardAction: (...a: unknown[]) => saveBusinessCardAction(...a),
  renewOwnerLinkAction: vi.fn(),
  renewScanCodeAction: vi.fn(),
}))
vi.mock('@/actions/assets', () => ({ uploadAssetAction: vi.fn() }))

const { BusinessCardEditor } = await import('@/app/dashboard/karten/[cardId]/_business/business-card-editor')

afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
  saveBusinessCardAction.mockResolvedValue({
    success: true,
    data: { version: 2, createdContactIds: {}, changed: { design: false, company: false, contacts: 1, deleted: 0 } },
    error: null,
  })
})

const data: BusinessEditorData = {
  cardId: 'ckcard00000000000000000001',
  cardName: 'Visitenkarten Nordlicht',
  orgName: 'Nordlicht GmbH',
  design: {
    backgroundColor: '#1f3a5f',
    foregroundColor: '#ffffff',
    labelColor: '#b9cbe3',
    cardTitle: '',
    logoAssetId: null,
    logoUrl: null,
  },
  publishedVersion: 1,
  company: { company: 'Nordlicht GmbH', website: null, phone: null, street: null, postalCode: null, city: null },
  contacts: [
    {
      id: 'ckcont00000000000000000001',
      contact: { firstName: 'Anna', lastName: 'Schmidt', jobTitle: 'Vertrieb', phone: null, mobile: null, email: null, links: [] },
      photoAssetId: null,
      photoUrl: null,
      scanUrl: 'https://stampie.de/v/code123',
      scanQr: 'data:image/png;base64,',
      ownerUrl: null,
      ownerQr: null,
      stats: { views: 3, walletAdds: 1, contactsSaved: 0, holders: 1, ownerHasPass: true },
    },
  ],
}

function saveButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'Speichern' }) as HTMLButtonElement
}

describe('BusinessCardEditor', () => {
  it('starts saved, with the save button disabled', () => {
    render(<BusinessCardEditor data={data} />)
    expect(screen.getByText('Alles gespeichert')).toBeTruthy()
    expect(saveButton().disabled).toBe(true)
  })

  it('collects edits from every section and saves them with one click', async () => {
    render(<BusinessCardEditor data={data} />)

    fireEvent.change(screen.getByLabelText('E-Mail'), { target: { value: 'anna@nordlicht.de' } })
    fireEvent.change(screen.getByLabelText('Ort'), { target: { value: 'Hamburg' } })
    fireEvent.click(screen.getByRole('button', { name: /Graphit/ }))

    expect(screen.getByText('Ungespeicherte Änderungen')).toBeTruthy()
    expect(saveButton().disabled).toBe(false)

    await act(async () => {
      fireEvent.click(saveButton())
    })

    expect(saveBusinessCardAction).toHaveBeenCalledTimes(1)
    const payload = saveBusinessCardAction.mock.calls[0]![0]
    expect(payload.contacts[0]).toMatchObject({ id: data.contacts[0]!.id, email: 'anna@nordlicht.de' })
    expect(payload.company).toMatchObject({ company: 'Nordlicht GmbH', city: 'Hamburg' })
    expect(payload.design.backgroundColor).toBe('#26282c')
    expect(refresh).toHaveBeenCalled()
    expect(screen.getByText(/Gespeichert/)).toBeTruthy()
  })

  it('shows what is typed in the preview right away', () => {
    render(<BusinessCardEditor data={data} />)
    fireEvent.change(screen.getByLabelText('Vorname'), { target: { value: 'Annika' } })
    expect(screen.getAllByText('Annika Schmidt').length).toBeGreaterThan(0)
  })

  it('adds a person locally and sends it as new on save', async () => {
    render(<BusinessCardEditor data={data} />)
    fireEvent.click(screen.getByRole('button', { name: /Person hinzufügen/ }))
    fireEvent.change(screen.getByLabelText('Vorname'), { target: { value: 'Ben' } })
    fireEvent.change(screen.getByLabelText('Nachname'), { target: { value: 'Meier' } })

    await act(async () => {
      fireEvent.click(saveButton())
    })

    const payload = saveBusinessCardAction.mock.calls[0]![0]
    expect(payload.contacts).toHaveLength(2)
    expect(payload.contacts[1]).toMatchObject({ id: null, firstName: 'Ben', lastName: 'Meier' })
  })

  it('removes a saved person only on save, and can undo it', () => {
    render(<BusinessCardEditor data={data} />)
    fireEvent.click(screen.getByRole('button', { name: 'Person entfernen' }))
    expect(screen.getByText(/1 Person wird beim Speichern entfernt/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Rückgängig/ }))
    expect(screen.getByText('Alles gespeichert')).toBeTruthy()
  })

  it('shows server errors at the field', async () => {
    saveBusinessCardAction.mockResolvedValue({
      success: false,
      data: null,
      error: { message: 'Bitte eine gültige E-Mail-Adresse angeben.', code: 'validation', fields: { 'contacts.0.email': 'Bitte eine gültige E-Mail-Adresse angeben.' } },
    })
    render(<BusinessCardEditor data={data} />)
    fireEvent.change(screen.getByLabelText('E-Mail'), { target: { value: 'x' } })

    await act(async () => {
      fireEvent.click(saveButton())
    })

    expect(screen.getAllByText('Bitte eine gültige E-Mail-Adresse angeben.').length).toBeGreaterThan(0)
    expect(screen.getByText('prüfen')).toBeTruthy()
  })
})
