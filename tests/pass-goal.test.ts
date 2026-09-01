import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Welches Stempel-Ziel gilt.
 *
 * Es gibt zwei Kandidaten: das beim Ausgeben in `IssuedPass.stampGoal` eingefrorene und
 * das aktuelle im Design. Lange las jede Seite ein anderes — die Karte im Wallet wurde aus
 * dem Design gebaut, die Kasse rechnete gegen den Pass. Bei Hairlight standen dadurch
 * Karten mit Zielen von 5, 9 und 10 im Umlauf, während der Designer 7 zeigte.
 *
 * Entschieden ist: **das Design gilt, für alle Karten.** Ändert ein Betrieb die
 * Stempelzahl, zieht sie überall mit — sonst laufen mehrere Ziele nebeneinander und
 * niemand weiß mehr, welche Karte wann voll ist. `IssuedPass.stampGoal` wird bei jeder
 * Buchung nachgezogen und bleibt dadurch ehrlich, statt einen Stand zu behaupten, gegen
 * den niemand rechnet.
 */

const passFindFirst = vi.fn()
vi.mock('@/lib/db', () => ({
  prisma: { issuedPass: { findFirst: (...a: unknown[]) => passFindFirst(...a) } },
}))

const buildApplePass = vi.fn()
vi.mock('@/lib/pass/mock-pass-builder', () => ({
  getPassBuilder: () => ({ buildApplePass: (...a: unknown[]) => buildApplePass(...a) }),
}))

vi.mock('@/lib/cards/asset-service', () => ({ loadPassAssets: async () => ({}) }))
vi.mock('@/lib/pass/apple-passkit-auth', () => ({ ensureAppleAuthToken: async () => 'tok' }))

const loadPublishedDesign = vi.fn()
vi.mock('@/lib/cards/repository', () => ({
  loadPublishedDesign: (...a: unknown[]) => loadPublishedDesign(...a),
  loadOrCreateDraft: async () => ({ design: { stampGoal: 99, stampLabel: 'Entwurf' } }),
}))

const { rebuildIssuedPass } = await import('@/lib/cards/pass-rebuild')

const pass = {
  serial: 'K-1',
  stamps: 8,
  // Ausgegeben mit Ziel 10 …
  stampGoal: 10,
  kind: 'STAMP',
  cardId: 'c1',
  activeMessage: null,
  marketingConsentAt: null,
  card: { name: 'Karte', org: { name: 'Hairlight by Rejin' } },
}

beforeEach(() => {
  vi.clearAllMocks()
  passFindFirst.mockResolvedValue(pass)
  // … im Designer steht inzwischen 7.
  loadPublishedDesign.mockResolvedValue({ stampGoal: 7, stampLabel: 'Schnitte' })
  buildApplePass.mockResolvedValue(Buffer.from('pkpass'))
})

describe('rebuildIssuedPass', () => {
  it('baut die Karte mit dem Ziel des Designs', async () => {
    await rebuildIssuedPass('K-1')

    // Die Kasse rechnet gegen dieselbe Zahl — deshalb darf hier keine andere stehen.
    expect(buildApplePass.mock.calls[0]![0].stampGoal).toBe(7)
  })

  it('gilt auch, wenn das Ziel erhöht wurde', async () => {
    loadPublishedDesign.mockResolvedValue({ stampGoal: 12, stampLabel: 'Schnitte' })

    await rebuildIssuedPass('K-1')

    expect(buildApplePass.mock.calls[0]![0].stampGoal).toBe(12)
  })

  it('zeigt den Stand des Passes', async () => {
    await rebuildIssuedPass('K-1')

    expect(buildApplePass.mock.calls[0]![0].currentStamps).toBe(8)
  })

  it('nimmt den Entwurf, solange nichts veröffentlicht ist', async () => {
    loadPublishedDesign.mockResolvedValue(null)

    await rebuildIssuedPass('K-1')

    expect(buildApplePass.mock.calls[0]![0].stampGoal).toBe(99)
  })

  it('gibt null zurück, wenn es die Karte nicht mehr gibt', async () => {
    passFindFirst.mockResolvedValue(null)

    expect(await rebuildIssuedPass('K-weg')).toBeNull()
    expect(buildApplePass).not.toHaveBeenCalled()
  })
})
