import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Volle Karte an der Kasse: einlösen und zurücksetzen.
 *
 * Vorher wies die Schnittstelle eine volle Karte mit „bitte zuerst die Belohnung einlösen"
 * ab — nur gab es in der App keinen Weg dorthin. Jetzt ist der zweite Scan auf der vollen
 * Karte genau die Geste, die im Laden ohnehin passiert.
 *
 * Eine Belohnung ist Geld. Deshalb prüft dieser Test vor allem, dass sie nicht zweimal
 * herausgegeben wird und dass übrige Stempel nicht verschwinden.
 */

const passFindFirst = vi.fn()
const passUpdate = vi.fn()
const eventFindFirst = vi.fn()
const eventCreate = vi.fn()

vi.mock('@/lib/db', () => ({
  prisma: {
    issuedPass: {
      findFirst: (...a: unknown[]) => passFindFirst(...a),
      update: (...a: unknown[]) => passUpdate(...a),
    },
    stampEvent: {
      findFirst: (...a: unknown[]) => eventFindFirst(...a),
      create: (...a: unknown[]) => eventCreate(...a),
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        issuedPass: { update: (...a: unknown[]) => passUpdate(...a) },
        stampEvent: { create: (...a: unknown[]) => eventCreate(...a) },
      }),
  },
}))

const requireAppUser = vi.fn()
vi.mock('@/lib/auth/app-session', () => ({
  requireAppUser: (...a: unknown[]) => requireAppUser(...a),
}))

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: () => ({ allowed: true, remaining: 1, resetAt: 0 }),
}))

const pushApple = vi.fn()
const syncGoogle = vi.fn()
vi.mock('@/lib/wallet/apple-sync', () => ({
  pushAppleWalletUpdate: (...a: unknown[]) => pushApple(...a),
}))
vi.mock('@/lib/wallet/google-sync', () => ({
  syncGoogleStampCount: (...a: unknown[]) => syncGoogle(...a),
}))
vi.mock('@/lib/cards/repository', () => ({ loadPublishedDesign: async () => null }))

const { POST } = await import('@/app/api/app/stamp/route')

const scan = (serial = 'K-VOLL') =>
  new Request('https://karte.stampie.de/api/app/stamp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
    body: JSON.stringify({ scanned: serial }),
  })

const vollerPass = {
  id: 'p1',
  stamps: 10,
  stampGoal: 10,
  cardId: 'c1',
  card: { orgId: 'org-1' },
}

beforeEach(() => {
  vi.clearAllMocks()
  requireAppUser.mockResolvedValue({ userId: 'u1', orgId: 'org-1', role: 'OWNER' })
  passFindFirst.mockResolvedValue(vollerPass)
  eventFindFirst.mockResolvedValue(null)
  eventCreate.mockResolvedValue({})
  passUpdate.mockImplementation(async ({ data }: { data: { stamps: number } }) => ({
    stamps: data.stamps,
    stampGoal: 10,
    rewardCount: 1,
  }))
  pushApple.mockResolvedValue(undefined)
  syncGoogle.mockResolvedValue(undefined)
})

describe('Scan auf einer vollen Karte', () => {
  it('löst ein und setzt auf null zurück', async () => {
    const res = await POST(scan())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.redeemed).toBe(true)
    expect(body.stamps).toBe(0)
    expect(body.booked).toBe(-10)
  })

  it('schreibt eine REDEEM-Buchung in die Prüfspur', async () => {
    await POST(scan())

    expect(eventCreate).toHaveBeenCalledOnce()
    expect(eventCreate.mock.calls[0]![0].data).toMatchObject({
      passId: 'p1',
      kind: 'REDEEM',
      delta: -10,
      balance: 0,
      stampedBy: 'u1',
    })
  })

  it('zählt die Belohnung hoch und merkt sich wann', async () => {
    await POST(scan())

    const data = passUpdate.mock.calls[0]![0].data
    expect(data.rewardCount).toEqual({ increment: 1 })
    expect(data.lastRewardAt).toBeInstanceOf(Date)
  })

  it('behält übrige Stempel statt sie zu verschlucken', async () => {
    // Ziel 10, aber 12 gesammelt: nach dem Einlösen bleiben 2 stehen.
    passFindFirst.mockResolvedValue({ ...vollerPass, stamps: 12 })

    const body = await (await POST(scan())).json()

    expect(body.stamps).toBe(2)
  })

  it('gibt nicht zweimal hintereinander eine Belohnung heraus', async () => {
    // Doppelscan: die Karte war nach dem ersten Einlösen sofort wieder voll.
    eventFindFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 5_000) })

    const res = await POST(scan())
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.code).toBe('cooldown')
    expect(eventCreate).not.toHaveBeenCalled()
    expect(passUpdate).not.toHaveBeenCalled()
  })

  it('lässt nach Ablauf der Sperrfrist wieder einlösen', async () => {
    eventFindFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 120_000) })

    const body = await (await POST(scan())).json()

    expect(body.redeemed).toBe(true)
  })

  it('aktualisiert die Karte im Wallet des Kunden', async () => {
    await POST(scan())
    expect(pushApple).toHaveBeenCalledWith('K-VOLL')
  })

  it('löst nichts ein für eine fremde Karte', async () => {
    passFindFirst.mockResolvedValue({ ...vollerPass, card: { orgId: 'anderer-betrieb' } })

    const res = await POST(scan())

    expect(res.status).toBe(403)
    expect(eventCreate).not.toHaveBeenCalled()
  })
})
