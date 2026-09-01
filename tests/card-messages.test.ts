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
  passFindMany.mockReset().mockResolvedValue([pass('p1', 3)])
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
describe('deliverCardMessage — an alle', () => {
  it('schreibt den Text auf die Pässe, nicht auf die Karte', async () => {
    messageFindFirst.mockResolvedValue(message())

    const result = await deliverCardMessage('m1')

    // Frueher lag der Text auf der Karte und wurde von jedem Pass geerbt. Genau das ist
    // der Weg, auf dem eine fehlende Einwilligung uebergangen wuerde.
    expect(cardUpdate).not.toHaveBeenCalled()
    expect(passUpdateMany.mock.calls[0]?.[0].data.activeMessage).toBe('Heute doppelte Stempel.')
    expect(pushForPasses).toHaveBeenCalledWith(['sn_p1'])
    expect(result.googleSynced).toBe(true)
    expect(result.error).toBeNull()
  })

  it('fragt nur Pässe mit Einwilligung ab', async () => {
    messageFindFirst.mockResolvedValue(message())

    await deliverCardMessage('m1')

    expect(passFindMany.mock.calls[0]?.[0].where).toMatchObject({
      cardId: 'card-1',
      isTest: false,
      marketingConsentAt: { not: null },
    })
  })

  it('nimmt bei "an alle" auch Gutscheine mit, nicht nur Stempelkarten', async () => {
    messageFindFirst.mockResolvedValue(message())

    await deliverCardMessage('m1')

    // Nur die Stempelgruppen zaehlen Stempel; "alle" darf sich nicht auf STAMP verengen.
    expect(passFindMany.mock.calls[0]?.[0].where.kind).toBeUndefined()
  })

  it('sagt es, wenn niemand eingewilligt hat, statt Versand zu melden', async () => {
    messageFindFirst.mockResolvedValue(message())
    passFindMany.mockResolvedValue([])

    const result = await deliverCardMessage('m1')

    expect(result.recipients).toBe(0)
    expect(pushForPasses).not.toHaveBeenCalled()
    expect(result.error).toContain('eingewilligt')
  })

  it('refuses to claim delivery when the text is unchanged', async () => {
    messageFindFirst.mockResolvedValue(message())
    passFindMany.mockResolvedValue([pass('p1', 3, { activeMessage: 'Heute doppelte Stempel.' })])

    const result = await deliverCardMessage('m1')

    // iOS meldet nur bei geaendertem Feld. Gleicher Text, keine Aenderung, keine Meldung.
    expect(pushForPasses).not.toHaveBeenCalled()
    expect(result.appleDevices).toBe(0)
    expect(result.error).toContain('identischer Text')
  })

  it('still reaches Google when Apple has nothing to change', async () => {
    messageFindFirst.mockResolvedValue(message())
    passFindMany.mockResolvedValue([pass('p1', 3, { activeMessage: 'Heute doppelte Stempel.' })])

    const result = await deliverCardMessage('m1')

    expect(sendGoogleMessageToPasses).toHaveBeenCalled()
    expect(result.googleSynced).toBe(true)
  })

  it('sends a coupon message against the offer class, not the loyalty one', async () => {
    messageFindFirst.mockResolvedValue(message({ card: { kind: 'COUPON', activeMessage: null } }))

    await deliverCardMessage('m1')

    expect(sendGoogleMessageToPasses.mock.calls[0]?.[2]).toBe('COUPON')
  })

  it('marks a half-failed message as sent rather than retrying it forever', async () => {
    messageFindFirst.mockResolvedValue(message())
    sendGoogleMessageToPasses.mockResolvedValue({ delivered: 0, failed: 1, configured: true })

    const result = await deliverCardMessage('m1')

    // Die Apple-Haelfte ist raus. Ein zweiter Versuch erreichte diese Handys doppelt.
    expect(messageUpdate.mock.calls[0]?.[0].data.sentAt).toBeInstanceOf(Date)
    expect(result.error).toContain('Google')
  })

  it('reports failed Apple pushes instead of swallowing them', async () => {
    messageFindFirst.mockResolvedValue(message())
    pushForPasses.mockResolvedValue({ passes: 1, devices: 1, failed: 2 })

    const result = await deliverCardMessage('m1')

    expect(result.error).toContain('2 Karten nicht erreicht')
  })

  it('does nothing for a message that already went out', async () => {
    messageFindFirst.mockResolvedValue(null)

    const result = await deliverCardMessage('m1')

    expect(pushForPasses).not.toHaveBeenCalled()
    expect(sendGoogleMessageToPasses).not.toHaveBeenCalled()
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

  it('ueberschreibt eine aeltere Gruppennachricht auf dem Pass', async () => {
    messageFindFirst.mockResolvedValue(message())
    passFindMany.mockResolvedValue([pass('p1', 3, { activeMessage: 'Alte Gruppennachricht.' })])

    await deliverCardMessage('m1')

    // Frueher brauchte es dafuer einen Aufraeum-Schritt, weil der Rundruf auf der Karte
    // lag und vom Pass ueberdeckt wurde. Jetzt wird der Pass direkt beschrieben.
    const write = passUpdateMany.mock.calls[0]?.[0]
    expect(write.where.id.in).toEqual(['p1'])
    expect(write.data.activeMessage).toBe('Heute doppelte Stempel.')
  })

  it('haelt eine unbekannte Gruppe fuer "alle", statt den Lauf zu sprengen', async () => {
    messageFindFirst.mockResolvedValue(message({ segment: 'GAB_ES_MAL' }))

    await deliverCardMessage('m1')

    expect(pushForPasses).toHaveBeenCalledWith(['sn_p1'])
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
    sendGoogleMessageToPasses
      .mockResolvedValueOnce({ delivered: 1, failed: 0, configured: true })
      .mockResolvedValueOnce({ delivered: 0, failed: 1, configured: true })

    expect(await deliverDueMessages()).toEqual({ delivered: 1, failed: 1 })
  })
})
