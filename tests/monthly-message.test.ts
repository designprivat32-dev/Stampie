import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Die Monatsnachricht, die von selbst läuft.
 *
 * Sie erzeugt bei jedem Versand eine ganz normale `CardMessage` und schickt sie über
 * denselben Weg wie eine von Hand geschriebene — es gibt keinen zweiten Versandpfad, der
 * getrennt kaputtgehen könnte. Geprüft wird hier vor allem das Drumherum: der nächste
 * Termin, die Markierung als automatisch, und dass ein Fehlschlag keine Schleife auslöst.
 */

const monthlyFindMany = vi.fn()
const monthlyUpdate = vi.fn()
const messageCreate = vi.fn()
vi.mock('@/lib/db', () => ({
  prisma: {
    cardMonthlyMessage: {
      findMany: (...a: unknown[]) => monthlyFindMany(...a),
      update: (...a: unknown[]) => monthlyUpdate(...a),
    },
    cardMessage: { create: (...a: unknown[]) => messageCreate(...a) },
  },
}))

const deliverCardMessage = vi.fn()
vi.mock('@/lib/cards/message-service', () => ({
  MESSAGE_MAX_LENGTH: 150,
  deliverCardMessage: (...a: unknown[]) => deliverCardMessage(...a),
}))

const { deliverDueMonthlyMessages, nextMonthlyDue } = await import(
  '@/lib/cards/monthly-message-service'
)

const NOW = new Date(2026, 9, 10, 12, 0, 0) // 10. Oktober 2026, mittags, Ortszeit

const faellig = {
  id: 'mm1',
  cardId: 'c1',
  headline: null,
  body: 'Diesen Monat: Paella-Abend',
  dayOfMonth: 10,
  createdBy: 'u1',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  monthlyFindMany.mockResolvedValue([])
  monthlyUpdate.mockResolvedValue({})
  messageCreate.mockResolvedValue({ id: 'm1' })
  deliverCardMessage.mockResolvedValue({ ok: true })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('nextMonthlyDue', () => {
  it('nimmt den Termin in diesem Monat, wenn er noch kommt', () => {
    const next = nextMonthlyDue(15, NOW)

    expect(next.getMonth()).toBe(9)
    expect(next.getDate()).toBe(15)
  })

  it('springt in den naechsten Monat, wenn der Tag heute ist', () => {
    /*
     * Wer am Zehnten einrichtet und den Zehnten waehlt, soll die Nachricht nicht eine
     * Stunde spaeter bei allen Kunden haben, ohne es gewollt zu haben.
     */
    const next = nextMonthlyDue(10, NOW)

    expect(next.getMonth()).toBe(10)
    expect(next.getDate()).toBe(10)
  })

  it('springt ueber den Jahreswechsel', () => {
    const next = nextMonthlyDue(1, new Date(2026, 11, 20))

    expect(next.getFullYear()).toBe(2027)
    expect(next.getMonth()).toBe(0)
  })

  it('deckelt auf den 28., damit es den Tag in jedem Monat gibt', () => {
    const next = nextMonthlyDue(31, new Date(2026, 0, 1))

    expect(next.getDate()).toBe(28)
  })
})

describe('deliverDueMonthlyMessages', () => {
  it('verschickt ueber denselben Weg wie eine Nachricht von Hand', async () => {
    monthlyFindMany.mockResolvedValue([faellig])

    const result = await deliverDueMonthlyMessages(NOW)

    expect(result).toEqual({ due: 1, sent: 1, errors: 0 })
    expect(deliverCardMessage).toHaveBeenCalledWith('m1')
  })

  it('markiert die erzeugte Nachricht als automatisch', async () => {
    monthlyFindMany.mockResolvedValue([faellig])

    await deliverDueMonthlyMessages(NOW)

    // Ohne diese Markierung frisst der Automatismus das Monatskontingent des Betriebs auf.
    expect(messageCreate.mock.calls[0]![0].data.monthlyMessageId).toBe('mm1')
    expect(messageCreate.mock.calls[0]![0].data.segment).toBe('ALL')
  })

  it('stellt den Termin auf den naechsten Monat', async () => {
    monthlyFindMany.mockResolvedValue([faellig])

    await deliverDueMonthlyMessages(NOW)

    const next = monthlyUpdate.mock.calls[0]![0].data.nextSendAt as Date
    expect(next.getMonth()).toBe(10)
    expect(next.getDate()).toBe(10)
  })

  it('holt verpasste Monate nicht nach', async () => {
    /*
     * Laeuft der Versand einmal nicht — kein Ping, Wartung, abgelaufenes Geheimnis —, soll
     * der Kunde nicht drei Nachrichten hintereinander fuer drei stille Monate bekommen.
     * Der naechste Termin wird deshalb aus dem Jetzt gerechnet, nicht aus dem alten.
     */
    monthlyFindMany.mockResolvedValue([faellig])

    await deliverDueMonthlyMessages(new Date(2026, 11, 24, 9, 0, 0))

    const next = monthlyUpdate.mock.calls[0]![0].data.nextSendAt as Date
    expect(next.getFullYear()).toBe(2027)
    expect(next.getMonth()).toBe(0)
  })

  it('stellt den Termin auch nach einem Fehlschlag weiter', async () => {
    // Sonst versucht es der naechste Lauf in zehn Minuten erneut — und wieder, und wieder.
    monthlyFindMany.mockResolvedValue([faellig])
    deliverCardMessage.mockRejectedValue(new Error('Apple antwortet nicht'))

    const result = await deliverDueMonthlyMessages(NOW)

    expect(result.errors).toBe(1)
    expect(monthlyUpdate).toHaveBeenCalled()
  })

  it('sucht nur, was aktiv und faellig ist', async () => {
    await deliverDueMonthlyMessages(NOW)

    expect(monthlyFindMany.mock.calls[0]![0].where).toEqual({
      enabled: true,
      nextSendAt: { lte: NOW },
    })
  })
})
