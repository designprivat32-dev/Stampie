import { beforeEach, describe, expect, it, vi } from 'vitest'

const messageFindFirst = vi.fn()
const messageFindMany = vi.fn()
const messageUpdate = vi.fn()
const cardUpdate = vi.fn()
const pushForCard = vi.fn()
const sendGoogleMessage = vi.fn()

vi.mock('@/lib/db', () => ({
  prisma: {
    cardMessage: {
      findFirst: (...a: unknown[]) => messageFindFirst(...a),
      findMany: (...a: unknown[]) => messageFindMany(...a),
      update: (...a: unknown[]) => messageUpdate(...a),
    },
    card: { update: (...a: unknown[]) => cardUpdate(...a) },
  },
}))
vi.mock('@/lib/wallet/apple-sync', () => ({
  pushAppleWalletUpdateForCard: (...a: unknown[]) => pushForCard(...a),
}))
vi.mock('@/lib/wallet/google-sync', () => ({
  sendGoogleWalletMessage: (...a: unknown[]) => sendGoogleMessage(...a),
}))

const { deliverCardMessage, deliverDueMessages } = await import('@/lib/cards/message-service')

function message(over: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    cardId: 'card-1',
    headline: 'Aktion',
    body: 'Heute doppelte Stempel.',
    card: { kind: 'STAMP', activeMessage: null },
    ...over,
  }
}

beforeEach(() => {
  messageFindFirst.mockReset()
  messageFindMany.mockReset()
  messageUpdate.mockReset().mockResolvedValue({})
  cardUpdate.mockReset().mockResolvedValue({})
  pushForCard.mockReset().mockResolvedValue({ passes: 3, devices: 4, failed: 0 })
  sendGoogleMessage.mockReset().mockResolvedValue({ status: 'updated' })
})

/**
 * Apple has no channel for free-form pushes: a notification exists only as the side effect
 * of a pass field changing. Every rule below follows from that, and getting one wrong is
 * silent — the shop sees "gesendet" and no phone ever lights up.
 */
describe('deliverCardMessage', () => {
  it('writes the text onto the card, then knocks on the phones', async () => {
    messageFindFirst.mockResolvedValue(message())

    const result = await deliverCardMessage('m1')

    expect(cardUpdate.mock.calls[0]?.[0].data.activeMessage).toBe('Heute doppelte Stempel.')
    expect(pushForCard).toHaveBeenCalledWith('card-1')
    expect(result.appleDevices).toBe(4)
    expect(result.googleSynced).toBe(true)
    expect(result.error).toBeNull()
  })

  it('refuses to claim delivery when the text is unchanged', async () => {
    messageFindFirst.mockResolvedValue(
      message({ card: { kind: 'STAMP', activeMessage: 'Heute doppelte Stempel.' } }),
    )

    const result = await deliverCardMessage('m1')

    // iOS notifies on a *changed* field. Same text, no change, no notification — so no
    // push is even attempted and the shop is told why.
    expect(pushForCard).not.toHaveBeenCalled()
    expect(cardUpdate).not.toHaveBeenCalled()
    expect(result.appleDevices).toBe(0)
    expect(result.error).toContain('identischer Text')
  })

  it('still reaches Google when Apple has nothing to change', async () => {
    messageFindFirst.mockResolvedValue(
      message({ card: { kind: 'STAMP', activeMessage: 'Heute doppelte Stempel.' } }),
    )

    const result = await deliverCardMessage('m1')

    // Google files the message itself and does not care whether the text repeats.
    expect(sendGoogleMessage).toHaveBeenCalled()
    expect(result.googleSynced).toBe(true)
  })

  it('sends a coupon message against the offer class, not the loyalty one', async () => {
    messageFindFirst.mockResolvedValue(message({ card: { kind: 'COUPON', activeMessage: null } }))

    await deliverCardMessage('m1')

    expect(sendGoogleMessage.mock.calls[0]?.[2]).toBe('COUPON')
  })

  it('marks a half-failed message as sent rather than retrying it forever', async () => {
    messageFindFirst.mockResolvedValue(message())
    sendGoogleMessage.mockResolvedValue({ status: 'error', message: 'kaputt' })

    const result = await deliverCardMessage('m1')

    // The Apple half already went out. A retry would deliver it twice to those phones.
    expect(messageUpdate.mock.calls[0]?.[0].data.sentAt).toBeInstanceOf(Date)
    expect(result.error).toContain('Google')
  })

  it('reports failed Apple pushes instead of swallowing them', async () => {
    messageFindFirst.mockResolvedValue(message())
    pushForCard.mockResolvedValue({ passes: 1, devices: 1, failed: 2 })

    const result = await deliverCardMessage('m1')

    expect(result.error).toContain('2 Karten nicht erreicht')
  })

  it('does nothing for a message that already went out', async () => {
    messageFindFirst.mockResolvedValue(null)

    const result = await deliverCardMessage('m1')

    expect(pushForCard).not.toHaveBeenCalled()
    expect(sendGoogleMessage).not.toHaveBeenCalled()
    expect(result.error).toBeTruthy()
  })
})

describe('deliverDueMessages', () => {
  it('takes only what is due and unsent', async () => {
    messageFindMany.mockResolvedValue([])

    await deliverDueMessages(new Date('2026-08-16T09:00:00Z'))

    const where = messageFindMany.mock.calls[0]?.[0].where
    expect(where.sentAt).toBeNull()
    expect(where.scheduledFor.lte).toEqual(new Date('2026-08-16T09:00:00Z'))
  })

  it('caps a run so one batch cannot outlive the platform timeout', async () => {
    messageFindMany.mockResolvedValue([])

    await deliverDueMessages()

    expect(messageFindMany.mock.calls[0]?.[0].take).toBeLessThanOrEqual(25)
  })

  it('counts failures apart from deliveries', async () => {
    messageFindMany.mockResolvedValue([{ id: 'm1' }, { id: 'm2' }])
    messageFindFirst
      .mockResolvedValueOnce(message({ id: 'm1' }))
      .mockResolvedValueOnce(message({ id: 'm2', card: { kind: 'STAMP', activeMessage: null } }))
    sendGoogleMessage
      .mockResolvedValueOnce({ status: 'updated' })
      .mockResolvedValueOnce({ status: 'error', message: 'kaputt' })

    expect(await deliverDueMessages()).toEqual({ delivered: 1, failed: 1 })
  })
})
