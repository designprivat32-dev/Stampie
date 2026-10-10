import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Nachrichten aus der Betriebs-App — und ihre zwei Kontingente.
 *
 * Die PWA konnte bisher nur Erinnerungen an einzelne Kunden anlegen. Mit dieser Route kann
 * sie auch an alle Karteninhaber schreiben: sofort, oder als Monatsnachricht, die einmal
 * eingerichtet wird und von selbst läuft.
 *
 * Der eigentliche Prüfgegenstand sind die Grenzen. Sie liegen absichtlich im Server — eine
 * Grenze, die nur die Oberfläche kennt, ist in den Entwicklerwerkzeugen des Browsers zwei
 * Klicks weit weg.
 */

const cardFindFirst = vi.fn()
const cardFindMany = vi.fn()
const messageFindMany = vi.fn()
const messageCreate = vi.fn()
const monthlyFindMany = vi.fn()
const monthlyCount = vi.fn()
const monthlyCreate = vi.fn()
vi.mock('@/lib/db', () => ({
  prisma: {
    card: {
      findFirst: (...a: unknown[]) => cardFindFirst(...a),
      findMany: (...a: unknown[]) => cardFindMany(...a),
    },
    cardMessage: {
      findMany: (...a: unknown[]) => messageFindMany(...a),
      create: (...a: unknown[]) => messageCreate(...a),
    },
    cardMonthlyMessage: {
      findMany: (...a: unknown[]) => monthlyFindMany(...a),
      count: (...a: unknown[]) => monthlyCount(...a),
      create: (...a: unknown[]) => monthlyCreate(...a),
    },
  },
}))

const requireAppUser = vi.fn()
vi.mock('@/lib/auth/app-session', () => ({
  requireAppUser: (...a: unknown[]) => requireAppUser(...a),
}))

const deliverCardMessage = vi.fn()
vi.mock('@/lib/cards/message-service', () => ({
  MESSAGE_MAX_LENGTH: 150,
  deliverCardMessage: (...a: unknown[]) => deliverCardMessage(...a),
}))

const { GET, POST } = await import('@/app/api/app/messages/route')

const NOW = new Date('2026-10-10T12:00:00.000Z')
const CARD = 'ckxyz00000000000000000000'

const post = (body: unknown) =>
  new Request('https://karte.stampie.de/api/app/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
    body: JSON.stringify(body),
  })

const get = () =>
  new Request('https://karte.stampie.de/api/app/messages', {
    headers: { authorization: 'Bearer t' },
  })

/** Eine selbst geschriebene Nachricht — kein Automatismus dahinter. */
const selbst = { cardId: 'c1', monthlyMessageId: null }
/** Eine, die der Monatslauf erzeugt hat. */
const automatisch = { cardId: 'c1', monthlyMessageId: 'mm1' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  requireAppUser.mockResolvedValue({ userId: 'u1', orgId: 'org-1', role: 'OWNER' })
  cardFindFirst.mockResolvedValue({ id: 'c1' })
  cardFindMany.mockResolvedValue([{ id: 'c1', name: 'Stempelkarte' }])
  messageFindMany.mockResolvedValue([])
  messageCreate.mockResolvedValue({ id: 'm1' })
  monthlyFindMany.mockResolvedValue([])
  monthlyCount.mockResolvedValue(0)
  monthlyCreate.mockResolvedValue({ id: 'mm1' })
  deliverCardMessage.mockResolvedValue({ ok: true })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('POST /api/app/messages — sofort', () => {
  it('legt die Nachricht an und verschickt sie gleich', async () => {
    const res = await POST(post({ cardId: CARD, body: 'Heute Happy Hour' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.mode).toBe('now')
    expect(deliverCardMessage).toHaveBeenCalledWith('m1')
  })

  it('schickt an alle Karteninhaber — die PWA kennt keine Gruppen', async () => {
    await POST(post({ cardId: CARD, body: 'Hallo' }))

    expect(messageCreate.mock.calls[0]![0].data.segment).toBe('ALL')
  })

  it('lehnt die zweite im selben Monat ab', async () => {
    messageFindMany.mockResolvedValue([selbst])

    const res = await POST(post({ cardId: CARD, body: 'Noch eine' }))

    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('quota')
    expect(messageCreate).not.toHaveBeenCalled()
  })

  it('laesst sich vom Monatslauf nicht das Kontingent wegnehmen', async () => {
    /*
     * Der wichtigste Fall: Die automatische Monatsnachricht ist auch eine CardMessage.
     * Wuerde sie mitgezaehlt, haette der Betrieb ab dem Ersten nie wieder die Moeglichkeit,
     * selbst etwas zu schicken.
     */
    messageFindMany.mockResolvedValue([automatisch])

    const res = await POST(post({ cardId: CARD, body: 'Spontan' }))

    expect(res.status).toBe(200)
    expect(messageCreate).toHaveBeenCalled()
  })
})

describe('POST /api/app/messages — monatlich', () => {
  it('richtet sie ein, ohne sofort zu verschicken', async () => {
    const res = await POST(post({ cardId: CARD, body: 'Monatsgruss', mode: 'monthly', dayOfMonth: 15 }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.mode).toBe('monthly')
    expect(deliverCardMessage).not.toHaveBeenCalled()
    expect(monthlyCreate.mock.calls[0]![0].data.dayOfMonth).toBe(15)
  })

  it('nennt den ersten Termin', async () => {
    const res = await POST(post({ cardId: CARD, body: 'Monatsgruss', mode: 'monthly', dayOfMonth: 15 }))
    const body = await res.json()

    // Heute ist der 10., der 15. kommt noch: erster Versand in diesem Monat.
    expect(new Date(body.nextSendAt).getDate()).toBe(15)
    expect(new Date(body.nextSendAt).getMonth()).toBe(9)
  })

  it('laesst nur eine je Karte laufen', async () => {
    monthlyCount.mockResolvedValue(1)

    const res = await POST(post({ cardId: CARD, body: 'Noch eine', mode: 'monthly' }))

    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('quota')
    expect(monthlyCreate).not.toHaveBeenCalled()
  })

  it('weist Tage ab, die es nicht in jedem Monat gibt', async () => {
    const res = await POST(post({ cardId: CARD, body: 'Zum Dreissigsten', mode: 'monthly', dayOfMonth: 30 }))

    expect(res.status).toBe(400)
    expect(monthlyCreate).not.toHaveBeenCalled()
  })

  it('blockiert die sofortige Nachricht nicht', async () => {
    monthlyCount.mockResolvedValue(1)

    const res = await POST(post({ cardId: CARD, body: 'Spontan' }))

    expect(res.status).toBe(200)
  })
})

describe('POST /api/app/messages — Absicherung', () => {
  it('schreibt nur an Karten des eigenen Betriebs', async () => {
    cardFindFirst.mockResolvedValue(null)

    const res = await POST(post({ cardId: CARD, body: 'Fremd' }))

    expect(res.status).toBe(404)
    expect(messageCreate).not.toHaveBeenCalled()
    // Die Organisation stammt aus dem Token, nie aus dem Rumpf.
    expect(cardFindFirst.mock.calls[0]![0].where.orgId).toBe('org-1')
  })

  it('weist Agentur-Konten ab', async () => {
    requireAppUser.mockResolvedValue({ userId: 'u1', orgId: 'org-1', role: 'AGENCY' })

    const res = await POST(post({ cardId: CARD, body: 'Hallo' }))

    expect(res.status).toBe(403)
    expect(messageCreate).not.toHaveBeenCalled()
  })

  it('weist einen leeren Text ab', async () => {
    const res = await POST(post({ cardId: CARD, body: '   ' }))

    expect(res.status).toBe(400)
    expect(messageCreate).not.toHaveBeenCalled()
  })
})

describe('GET /api/app/messages', () => {
  it('sagt je Karte, was diesen Monat noch uebrig ist', async () => {
    messageFindMany.mockResolvedValueOnce([selbst]).mockResolvedValueOnce([])

    const res = await GET(get())
    const body = await res.json()

    expect(body.quota).toEqual([
      { cardId: 'c1', cardName: 'Stempelkarte', immediateLeft: 0, monthlyActive: false },
    ])
  })

  it('meldet eine laufende Monatsnachricht', async () => {
    monthlyFindMany.mockResolvedValue([
      {
        id: 'mm1',
        cardId: 'c1',
        body: 'Monatsgruss',
        dayOfMonth: 1,
        nextSendAt: new Date('2026-11-01T00:00:00.000Z'),
        lastSentAt: null,
        card: { name: 'Stempelkarte' },
      },
    ])

    const res = await GET(get())
    const body = await res.json()

    expect(body.quota[0].monthlyActive).toBe(true)
    expect(body.monthly[0].dayOfMonth).toBe(1)
  })

  it('kommt ohne Karten klar', async () => {
    cardFindMany.mockResolvedValue([])

    const res = await GET(get())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.quota).toEqual([])
    expect(body.messages).toEqual([])
  })
})
