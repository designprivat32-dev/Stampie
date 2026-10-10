import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Nachrichten aus der Betriebs-App — und ihre Monatsgrenze.
 *
 * Die PWA konnte bisher nur wiederkehrende Erinnerungen anlegen. Mit dieser Route kann sie
 * auch an alle Karteninhaber schreiben, sofort oder zu einem Zeitpunkt.
 *
 * Der eigentliche Prüfgegenstand ist die Grenze: je Karte und Kalendermonat eine sofortige
 * und eine geplante Nachricht. Sie liegt absichtlich im Server — eine Grenze, die nur die
 * Oberfläche kennt, ist in den Entwicklerwerkzeugen des Browsers zwei Klicks weit weg.
 */

const cardFindFirst = vi.fn()
const cardFindMany = vi.fn()
const messageFindMany = vi.fn()
const messageCreate = vi.fn()
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

/** Eine bereits verschickte Sofort-Nachricht: geplant für genau den Moment des Anlegens. */
function sofort(at: string) {
  return { cardId: 'c1', scheduledFor: new Date(at), createdAt: new Date(at) }
}
/** Eine geplante: Versand liegt deutlich hinter dem Anlegen. */
function geplant(created: string, due: string) {
  return { cardId: 'c1', scheduledFor: new Date(due), createdAt: new Date(created) }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  requireAppUser.mockResolvedValue({ userId: 'u1', orgId: 'org-1', role: 'OWNER' })
  cardFindFirst.mockResolvedValue({ id: 'c1' })
  cardFindMany.mockResolvedValue([{ id: 'c1', name: 'Stempelkarte' }])
  messageFindMany.mockResolvedValue([])
  messageCreate.mockResolvedValue({ id: 'm1' })
  deliverCardMessage.mockResolvedValue({ ok: true })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('POST /api/app/messages — sofort', () => {
  it('legt die Nachricht an und verschickt sie gleich', async () => {
    const res = await POST(post({ cardId: 'ckxyz00000000000000000000', body: 'Heute Happy Hour' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.kind).toBe('IMMEDIATE')
    // Sofort heisst sofort: nicht auf einen Lauf warten, der Stunden entfernt sein kann.
    expect(deliverCardMessage).toHaveBeenCalledWith('m1')
  })

  it('schickt an alle Karteninhaber — die PWA kennt keine Gruppen', async () => {
    await POST(post({ cardId: 'ckxyz00000000000000000000', body: 'Hallo' }))

    expect(messageCreate.mock.calls[0]![0].data.segment).toBe('ALL')
  })

  it('lehnt die zweite im selben Monat ab', async () => {
    messageFindMany.mockResolvedValue([sofort('2026-10-02T09:00:00.000Z')])

    const res = await POST(post({ cardId: 'ckxyz00000000000000000000', body: 'Noch eine' }))
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.code).toBe('quota')
    expect(messageCreate).not.toHaveBeenCalled()
  })

  it('laesst sich von einer geplanten Nachricht nicht blockieren', async () => {
    // Zwei Kontingente nebeneinander: die geplante Monatsnachricht darf die spontane
    // Ankuendigung nicht aufbrauchen.
    messageFindMany.mockResolvedValue([
      geplant('2026-10-01T08:00:00.000Z', '2026-10-20T10:00:00.000Z'),
    ])

    const res = await POST(post({ cardId: 'ckxyz00000000000000000000', body: 'Spontan' }))

    expect(res.status).toBe(200)
    expect(messageCreate).toHaveBeenCalled()
  })
})

describe('POST /api/app/messages — geplant', () => {
  const future = '2026-10-25T17:00:00.000Z'

  it('legt sie an, ohne sie schon zu verschicken', async () => {
    const res = await POST(
      post({ cardId: 'ckxyz00000000000000000000', body: 'Oktoberfest', scheduledFor: future }),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.kind).toBe('SCHEDULED')
    expect(deliverCardMessage).not.toHaveBeenCalled()
  })

  it('lehnt die zweite im selben Monat ab', async () => {
    messageFindMany.mockResolvedValue([
      geplant('2026-10-01T08:00:00.000Z', '2026-10-20T10:00:00.000Z'),
    ])

    const res = await POST(
      post({ cardId: 'ckxyz00000000000000000000', body: 'Noch eine', scheduledFor: future }),
    )

    expect(res.status).toBe(409)
    expect(messageCreate).not.toHaveBeenCalled()
  })

  it('zaehlt im Monat des Versands, nicht im Monat des Anlegens', async () => {
    /*
     * Sonst liessen sich im Oktober zwoelf Nachrichten fuer Dezember einstellen: jede
     * einzelne waere "die erste im Oktober", und der Kunde bekaeme im Dezember zwoelf.
     */
    await POST(
      post({ cardId: 'ckxyz00000000000000000000', body: 'Weihnachten', scheduledFor: '2026-12-20T10:00:00.000Z' }),
    )

    const where = messageFindMany.mock.calls[0]![0].where
    expect(where.scheduledFor.gte.getMonth()).toBe(11)
    expect(where.scheduledFor.lt.getMonth()).toBe(0)
  })

  it('weist einen Zeitpunkt ab, der schon fast da ist', async () => {
    const res = await POST(
      post({
        cardId: 'ckxyz00000000000000000000',
        body: 'Gleich',
        scheduledFor: '2026-10-10T12:01:00.000Z',
      }),
    )

    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('too_soon')
  })

  it('weist einen Zeitpunkt in ferner Zukunft ab', async () => {
    const res = await POST(
      post({
        cardId: 'ckxyz00000000000000000000',
        body: 'Irgendwann',
        scheduledFor: '2030-01-01T10:00:00.000Z',
      }),
    )

    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('too_far')
  })
})

describe('POST /api/app/messages — Absicherung', () => {
  it('schreibt nur an Karten des eigenen Betriebs', async () => {
    cardFindFirst.mockResolvedValue(null)

    const res = await POST(post({ cardId: 'ckxyz00000000000000000000', body: 'Fremd' }))

    expect(res.status).toBe(404)
    expect(messageCreate).not.toHaveBeenCalled()
    // Die Organisation stammt aus dem Token, nie aus dem Rumpf.
    expect(cardFindFirst.mock.calls[0]![0].where.orgId).toBe('org-1')
  })

  it('weist Agentur-Konten ab', async () => {
    requireAppUser.mockResolvedValue({ userId: 'u1', orgId: 'org-1', role: 'AGENCY' })

    const res = await POST(post({ cardId: 'ckxyz00000000000000000000', body: 'Hallo' }))

    expect(res.status).toBe(403)
    expect(messageCreate).not.toHaveBeenCalled()
  })

  it('weist einen leeren Text ab', async () => {
    const res = await POST(post({ cardId: 'ckxyz00000000000000000000', body: '   ' }))

    expect(res.status).toBe(400)
    expect(messageCreate).not.toHaveBeenCalled()
  })
})

describe('GET /api/app/messages', () => {
  it('sagt je Karte, was diesen Monat noch uebrig ist', async () => {
    messageFindMany
      .mockResolvedValueOnce([sofort('2026-10-02T09:00:00.000Z')])
      .mockResolvedValueOnce([])

    const res = await GET(get())
    const body = await res.json()

    expect(body.quota).toEqual([
      { cardId: 'c1', cardName: 'Stempelkarte', immediateLeft: 0, scheduledLeft: 1 },
    ])
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
