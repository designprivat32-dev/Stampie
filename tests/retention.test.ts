import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Die Aufbewahrungsfristen.
 *
 * Ein Fehler hier löscht echte Daten und lässt sich nicht zurücknehmen — deshalb prüft
 * dieser Test vor allem die Wege, auf denen zu *viel* verschwinden würde: eine vertippte
 * Null in der Umgebung, eine falsche Tabelle, ein Vorzeichenfehler in der Frist.
 */

const delStampEvent = vi.fn()
const delReminderDelivery = vi.fn()
const delMessage = vi.fn()
const delToken = vi.fn()
const delSession = vi.fn()

// Die Fabrik wird an den Dateianfang gezogen: sie darf nur Funktionen benutzen, die den
// Zugriff auf die Mocks verzoegern, keine bereits ausgewerteten Ausdruecke.
vi.mock('@/lib/db', () => ({
  prisma: {
    stampEvent: { deleteMany: (...a: unknown[]) => delStampEvent(...a) },
    cardReminderDelivery: { deleteMany: (...a: unknown[]) => delReminderDelivery(...a) },
    cardMessage: { deleteMany: (...a: unknown[]) => delMessage(...a) },
    testCardToken: { deleteMany: (...a: unknown[]) => delToken(...a) },
    appSession: { deleteMany: (...a: unknown[]) => delSession(...a) },
  },
}))

const deleteMany = {
  stampEvent: delStampEvent,
  cardReminderDelivery: delReminderDelivery,
  cardMessage: delMessage,
  testCardToken: delToken,
  appSession: delSession,
}

import {
  DEFAULT_RETENTION,
  cutoffsFor,
  readRetentionPolicy,
  runRetention,
} from '@/lib/privacy/retention'

const JETZT = new Date('2026-09-01T12:00:00.000Z')

describe('readRetentionPolicy', () => {
  it('nimmt die Vorgaben, wenn nichts gesetzt ist', () => {
    expect(readRetentionPolicy({})).toEqual(DEFAULT_RETENTION)
  })

  it('übernimmt gesetzte Werte', () => {
    expect(readRetentionPolicy({ RETENTION_STAMP_EVENT_DAYS: '90' }).stampEventDays).toBe(90)
  })

  it('verwirft eine 0 — die würde beim nächsten Lauf alles löschen', () => {
    expect(readRetentionPolicy({ RETENTION_STAMP_EVENT_DAYS: '0' }).stampEventDays).toBe(
      DEFAULT_RETENTION.stampEventDays,
    )
  })

  it('verwirft negative, gebrochene und unlesbare Werte', () => {
    for (const wert of ['-5', '1.5', 'abc', '']) {
      expect(readRetentionPolicy({ RETENTION_STAMP_EVENT_DAYS: wert }).stampEventDays).toBe(
        DEFAULT_RETENTION.stampEventDays,
      )
    }
  })
})

describe('cutoffsFor', () => {
  it('rechnet die Frist rückwärts, nicht vorwärts', () => {
    const cut = cutoffsFor({ ...DEFAULT_RETENTION, stampEventDays: 10 }, JETZT)
    expect(cut.stampEvents.toISOString()).toBe('2026-08-22T12:00:00.000Z')
    expect(cut.stampEvents.getTime()).toBeLessThan(JETZT.getTime())
  })

  it('gibt jeder Datenart ihre eigene Frist', () => {
    const cut = cutoffsFor(
      { stampEventDays: 400, reminderDeliveryDays: 400, sentMessageDays: 400, expiredTokenDays: 30 },
      JETZT,
    )
    expect(cut.expiredTokens.getTime()).toBeGreaterThan(cut.stampEvents.getTime())
  })
})

describe('runRetention', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const fn of Object.values(deleteMany)) fn.mockResolvedValue({ count: 0 })
  })

  it('löscht aus jeder vorgesehenen Tabelle und meldet die Zahlen', async () => {
    deleteMany.stampEvent.mockResolvedValue({ count: 7 })
    deleteMany.appSession.mockResolvedValue({ count: 3 })

    const result = await runRetention(JETZT)

    expect(result.stampEvents).toBe(7)
    expect(result.expiredSessions).toBe(3)
    for (const fn of Object.values(deleteMany)) expect(fn).toHaveBeenCalledOnce()
  })

  it('fasst ausgegebene Karten nicht an', async () => {
    await runRetention(JETZT)
    // IssuedPass taucht im Mock gar nicht auf: ein Zugriff darauf wäre ein TypeError.
    expect(Object.keys(deleteMany)).not.toContain('issuedPass')
  })

  it('löscht nur bereits versendete Nachrichten, keine geplanten', async () => {
    await runRetention(JETZT)
    const where = deleteMany.cardMessage.mock.calls[0]![0].where
    expect(where).toEqual({ sentAt: { lt: cutoffsFor(DEFAULT_RETENTION, JETZT).sentMessages } })
  })

  it('räumt abgelaufene Sitzungen ohne Schonfrist ab', async () => {
    await runRetention(JETZT)
    expect(deleteMany.appSession.mock.calls[0]![0].where).toEqual({ expiresAt: { lt: JETZT } })
  })
})
