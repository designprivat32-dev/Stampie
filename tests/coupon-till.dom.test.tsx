import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import * as React from 'react'
import type { PassSummary } from '@/actions/stamping'

const lookupPassAction = vi.fn()
const redeemCouponAction = vi.fn()
const stampAction = vi.fn()
const redeemAction = vi.fn()

vi.mock('@/actions/stamping', () => ({
  lookupPassAction: (...a: unknown[]) => lookupPassAction(...a),
  redeemCouponAction: (...a: unknown[]) => redeemCouponAction(...a),
  stampAction: (...a: unknown[]) => stampAction(...a),
  redeemAction: (...a: unknown[]) => redeemAction(...a),
}))

// The scanner needs a camera; the till is driven through the manual field here.
vi.mock('@/app/dashboard/karten/[cardId]/stempeln/_components/qr-scanner', () => ({
  QrScanner: () => null,
}))

const { TillView } = await import(
  '@/app/dashboard/karten/[cardId]/stempeln/_components/till-view'
)

const coupon = (over: Partial<PassSummary> = {}): PassSummary => ({
  serial: 'SN-DEMO-0001',
  stamps: 0,
  stampGoal: 10,
  isTest: false,
  rewardCount: 0,
  lastStampAt: null,
  stampLabel: 'Stempel',
  rewardText: '',
  redeemedAt: null,
  offerTitle: '20 % auf alles',
  ...over,
})

beforeEach(() => {
  lookupPassAction.mockReset()
  redeemCouponAction.mockReset()
  stampAction.mockReset()
  redeemAction.mockReset()
})
afterEach(cleanup)

async function look(pass: PassSummary) {
  lookupPassAction.mockResolvedValue({ success: true, data: pass })
  render(<TillView cardId="cloc00000000000000000001" cardKind="COUPON" />)
  fireEvent.change(screen.getByLabelText(/Kartennummer/), { target: { value: 'SN-DEMO-0001' } })
  fireEvent.click(screen.getByRole('button', { name: /Prüfen/ }))
  await waitFor(() => expect(lookupPassAction).toHaveBeenCalled())
}

describe('till view for a coupon card', () => {
  it('offers no stamping at all', async () => {
    await look(coupon())
    expect(screen.queryByRole('button', { name: 'Stempeln' })).toBeNull()
    expect(stampAction).not.toHaveBeenCalled()
  })

  it('shows the offer and a redeem button while the coupon is valid', async () => {
    await look(coupon())
    expect(screen.getByText('Gültig')).toBeTruthy()
    expect(screen.getByText('20 % auf alles')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Gutschein einlösen/ })).toBeTruthy()
  })

  // The expensive mistake this screen exists to prevent.
  it('refuses a second redemption: spent coupons get no button', async () => {
    await look(coupon({ redeemedAt: '2026-08-01T10:00:00.000Z' }))
    expect(screen.getByText('Bereits eingelöst')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Gutschein einlösen/ })).toBeNull()
  })

  it('confirms the redemption and stops offering it again', async () => {
    await look(coupon())
    redeemCouponAction.mockResolvedValue({
      success: true,
      data: coupon({ redeemedAt: '2026-08-09T10:00:00.000Z' }),
    })

    fireEvent.click(screen.getByRole('button', { name: /Gutschein einlösen/ }))
    await waitFor(() => expect(screen.getByText('Eingelöst')).toBeTruthy())
    expect(screen.queryByRole('button', { name: /Gutschein einlösen/ })).toBeNull()
  })

  it('surfaces the server refusal rather than pretending it worked', async () => {
    await look(coupon())
    redeemCouponAction.mockResolvedValue({
      success: false,
      error: { message: 'Dieser Gutschein wurde bereits am 01.08.2026 um 10:00 Uhr eingelöst.' },
    })

    fireEvent.click(screen.getByRole('button', { name: /Gutschein einlösen/ }))
    await waitFor(() => expect(screen.getByText(/bereits am 01.08.2026/)).toBeTruthy())
  })
})

describe('till view for a stamp card', () => {
  it('still offers stamping', async () => {
    lookupPassAction.mockResolvedValue({ success: true, data: coupon({ offerTitle: null }) })
    render(<TillView cardId="cloc00000000000000000001" cardKind="STAMP" />)
    expect(screen.getByRole('button', { name: 'Stempeln' })).toBeTruthy()
  })
})
