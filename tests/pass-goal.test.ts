import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Welches Stempel-Ziel eine ausgegebene Karte zeigt.
 *
 * Das Ziel wird beim Ausgeben in `IssuedPass.stampGoal` eingefroren, das Design im
 * Designer kann sich danach ändern. Lange lief beides auseinander: die Karte im Wallet
 * wurde aus dem *Design* gebaut, die Kasse rechnete gegen den *Pass*. Bei Hairlight
 * standen dadurch 63 Karten mit Zielen von 5, 9 und 10 im Umlauf, während der Designer 7
 * zeigte — ein Kunde sah „7/7 — voll" und wurde an der Kasse weiter gestempelt.
 *
 * Der Pass gewinnt. Eine Treuekarte ist ein Versprechen, und das ändert man nicht
 * nachträglich zulasten dessen, der schon sammelt.
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
  loadOrCreateDraft: async () => ({ design: { stampGoal: 99, stampLabel: 'Stempel' } }),
}))

const { rebuildIssuedPass } = await import('@/lib/cards/pass-rebuild')

const pass = {
  serial: 'K-1',
  stamps: 8,
  // Diese Karte wurde mit Ziel 10 ausgegeben …
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
  // … während im Designer inzwischen 7 steht.
  loadPublishedDesign.mockResolvedValue({ stampGoal: 7, stampLabel: 'Schnitte' })
  buildApplePass.mockResolvedValue(Buffer.from('pkpass'))
})

describe('rebuildIssuedPass', () => {
  it('baut die Karte mit dem Ziel des Passes, nicht dem des Designs', async () => {
    await rebuildIssuedPass('K-1')

    expect(buildApplePass.mock.calls[0]![0].stampGoal).toBe(10)
  })

  it('übernimmt alles Übrige weiterhin aus dem Design', async () => {
    await rebuildIssuedPass('K-1')

    // Farben, Beschriftungen, Bilder folgen dem Designer — nur das Ziel nicht.
    expect(buildApplePass.mock.calls[0]![0].stampLabel).toBe('Schnitte')
  })

  it('zeigt den Stand des Passes', async () => {
    await rebuildIssuedPass('K-1')

    expect(buildApplePass.mock.calls[0]![0].currentStamps).toBe(8)
  })

  it('gilt auch, wenn das Design ein höheres Ziel hat als der Pass', async () => {
    passFindFirst.mockResolvedValue({ ...pass, stampGoal: 5, stamps: 5 })
    loadPublishedDesign.mockResolvedValue({ stampGoal: 12, stampLabel: 'Schnitte' })

    await rebuildIssuedPass('K-1')

    // Wer mit 5 angefangen hat, ist bei 5 fertig — die Kasse sieht das genauso.
    expect(buildApplePass.mock.calls[0]![0].stampGoal).toBe(5)
  })

  it('gibt null zurück, wenn es die Karte nicht mehr gibt', async () => {
    passFindFirst.mockResolvedValue(null)

    expect(await rebuildIssuedPass('K-weg')).toBeNull()
    expect(buildApplePass).not.toHaveBeenCalled()
  })
})
