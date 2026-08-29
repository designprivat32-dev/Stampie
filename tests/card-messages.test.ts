import { beforeEach, describe, expect, it, vi } from 'vitest'

const messageFindFirst = vi.fn()
const messageFindMany = vi.fn()
const messageUpdate = vi.fn()
const cardUpdate = vi.fn()
const passFindMany = vi.fn()
const passUpdateMany = vi.fn()
const passCount = vi.fn()
const pushForCard = vi.fn()
const pushForPasses = vi.fn()
const sendGoogleMessage = vi.fn()
const sendGoogleMessageToPasses = vi.fn()

vi.mock('@/lib/db', () => ({
  prisma: {
    cardMessage: {
      findFirst: (...a: unknown[]) => messageFindFirst(...a),
      findMany: (...a: unknown[]) => messageFindMany(...a),
      update: (...a: unknown[]) => messageUpdate(...a),
    },
    card: { update: (...a: unknown[]) => cardUpdate(...a) },
    issuedPass: {
      findMany: (...a: unknown[]) => passFindMany(...a),
      updateMany: (...a: unknown[]) => passUpdateMany(...a),
      count: (...a: unknown[]) => passCount(...a),
    },
  },
}))
vi.mock('@/lib/wallet/apple-sync', () => ({
  pushAppleWalletUpdateForCard: (...a: unknown[]) => pushForCard(...a),
  pushAppleWalletUpdateForPasses: (...a: unknown[]) => pushForPasses(...a),
}))
vi.mock('@/lib/wallet/google-sync', () => ({
  sendGoogleWalletMessage: (...a: unknown[]) => sendGoogleMessage(...a),
  sendGoogleWalletMessageToPasses: (...a: unknown[]) => sendGoogleMessageToPasses(...a),
}))

const { deliverCardMessage, deliverDueMessages } = await import('@/lib/cards/message-service')

function message(over: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    cardId: 'card-1',
    headline: 'Aktion',
    body: 'Heute doppelte Stempel.',
    segment: 'ALL',
    card: { kind: 'STAMP', activeMessage: null },
    ...over,
  }
}

/** Eine ausgegebene Karte mit ihrem Stempelstand — die Grundlage jeder Gruppe. */
function pass(id: string, stamps: number, over: Record<string, unknown> = {}) {
  return { id, serial: `sn_${id}`, stamps, stampGoal: 10, activeMessage: null, ...over }
}

beforeEach(() => {
  messageFindFirst.mockReset()
  messageFindMany.mockReset()
  messageUpdate.mockReset().mockResolvedValue({})
  cardUpdate.mockReset().mockResolvedValue({})
  passFindMany.mockReset().mockResolvedValue([])
  passUpdateMany.mockReset().mockResolvedValue({ count: 0 })
  passCount.mockReset().mockResolvedValue(12)
  pushForCard.mockReset().mockResolvedValue({ passes: 3, devices: 4, failed: 0 })
  pushForPasses.mockReset().mockResolvedValue({ passes: 2, devices: 2, failed: 0 })
  sendGoogleMessage.mockReset().mockResolvedValue({ status: 'updated' })
  sendGoogleMessageToPasses
    .mockReset()
    .mockResolvedValue({ delivered: 1, failed: 0, configured: true })
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

/**
 * Gruppen statt Personen: das System kennt keine Namen, nur Stempelstände. Die Nachricht
 * hängt dann am einzelnen Pass statt an der Karte — sonst gäbe es keinen Weg, jemanden
 * gezielt *nicht* zu benachrichtigen.
 */
describe('deliverCardMessage an eine Gruppe', () => {
  it('trifft genau die Karten, denen noch ein Stempel fehlt', async () => {
    messageFindFirst.mockResolvedValue(message({ segment: 'MISSING_1' }))
    passFindMany.mockResolvedValue([pass('a', 9), pass('b', 8), pass('c', 10), pass('d', 0)])

    const result = await deliverCardMessage('m1')

    expect(result.recipients).toBe(1)
    expect(passUpdateMany.mock.calls[0]?.[0].where.id.in).toEqual(['a'])
    expect(pushForPasses).toHaveBeenCalledWith(['sn_a'])
    // Die Karte bleibt unangetastet — ihre Nachricht gilt für alle.
    expect(cardUpdate).not.toHaveBeenCalled()
    expect(pushForCard).not.toHaveBeenCalled()
  })

  it('rechnet gegen das Ziel des Passes, nicht gegen das des Designs', async () => {
    messageFindFirst.mockResolvedValue(message({ segment: 'MISSING_2' }))
    // Dieselben acht Stempel: bei Ziel 10 fehlen zwei, bei Ziel 12 fehlen vier.
    passFindMany.mockResolvedValue([
      pass('alt', 8, { stampGoal: 10 }),
      pass('neu', 8, { stampGoal: 12 }),
    ])

    const result = await deliverCardMessage('m1')

    expect(result.recipients).toBe(1)
    expect(pushForPasses).toHaveBeenCalledWith(['sn_alt'])
  })

  it('zaehlt eine volle Karte nicht zu "noch ein Stempel"', async () => {
    messageFindFirst.mockResolvedValue(message({ segment: 'MISSING_1' }))
    passFindMany.mockResolvedValue([pass('voll', 12), pass('fast', 9)])

    expect((await deliverCardMessage('m1')).recipients).toBe(1)
    expect(pushForPasses).toHaveBeenCalledWith(['sn_fast'])
  })

  it('erreicht leere Karten ueber die eigene Gruppe', async () => {
    messageFindFirst.mockResolvedValue(message({ segment: 'EMPTY' }))
    passFindMany.mockResolvedValue([pass('leer', 0), pass('angefangen', 3)])

    expect((await deliverCardMessage('m1')).recipients).toBe(1)
    expect(pushForPasses).toHaveBeenCalledWith(['sn_leer'])
  })

  it('laesst Testkarten aussen vor', async () => {
    messageFindFirst.mockResolvedValue(message({ segment: 'MISSING_1' }))

    await deliverCardMessage('m1')

    expect(passFindMany.mock.calls[0]?.[0].where.isTest).toBe(false)
  })

  it('sagt es, wenn in der Gruppe niemand steht, statt Versand zu melden', async () => {
    messageFindFirst.mockResolvedValue(message({ segment: 'MISSING_3' }))
    passFindMany.mockResolvedValue([pass('a', 9)])

    const result = await deliverCardMessage('m1')

    expect(result.recipients).toBe(0)
    expect(result.error).toContain('Niemand in dieser Gruppe')
    expect(pushForPasses).not.toHaveBeenCalled()
    expect(sendGoogleMessageToPasses).not.toHaveBeenCalled()
  })

  it('ueberspringt Paesse, die den Text schon tragen — iOS meldet nichts Gleiches', async () => {
    messageFindFirst.mockResolvedValue(message({ segment: 'MISSING_1' }))
    passFindMany.mockResolvedValue([
      pass('alt', 9, { activeMessage: 'Heute doppelte Stempel.' }),
      pass('neu', 9),
    ])

    const result = await deliverCardMessage('m1')

    expect(pushForPasses).toHaveBeenCalledWith(['sn_neu'])
    // Google kennt die Regel nicht und bekommt beide.
    expect(sendGoogleMessageToPasses.mock.calls[0]?.[0]).toEqual(['sn_alt', 'sn_neu'])
    expect(result.recipients).toBe(2)
  })

  it('schickt die Gruppennachricht an Google-Objekte, nicht an die Klasse', async () => {
    messageFindFirst.mockResolvedValue(message({ segment: 'MISSING_1' }))
    passFindMany.mockResolvedValue([pass('a', 9)])

    await deliverCardMessage('m1')

    expect(sendGoogleMessage).not.toHaveBeenCalled()
    expect(sendGoogleMessageToPasses).toHaveBeenCalled()
  })

  it('raeumt beim Versand an alle die alten Gruppennachrichten ab', async () => {
    messageFindFirst.mockResolvedValue(message())

    await deliverCardMessage('m1')

    // Sonst ueberdeckt die letzte Gruppennachricht auf dem Pass den Rundruf der Karte.
    const cleanup = passUpdateMany.mock.calls[0]?.[0]
    expect(cleanup.where.cardId).toBe('card-1')
    expect(cleanup.data.activeMessage).toBeNull()
  })

  it('haelt eine unbekannte Gruppe fuer "alle", statt den Lauf zu sprengen', async () => {
    messageFindFirst.mockResolvedValue(message({ segment: 'GAB_ES_MAL' }))

    await deliverCardMessage('m1')

    expect(pushForCard).toHaveBeenCalledWith('card-1')
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
