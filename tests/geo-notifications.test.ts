import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CARD_DESIGN } from '@/lib/cards/defaults'
import { designToRow } from '@/lib/cards/repository'

/**
 * Der Standort-Schalter aus der Kartenübersicht.
 *
 * Er umgeht Entwurf und Veröffentlichen, deshalb hängt hier alles daran, dass er genau
 * zwei Dinge tut und nichts darüber hinaus: das Flag auf beiden Design-Zeilen setzen und
 * die Wallets nachziehen. Vor allem darf Ausschalten die Standorte nicht mitnehmen — genau
 * dafür gibt es den Schalter, sonst hätte das Löschen der Standorte gereicht.
 */

const designFindMany = vi.fn()
const designFindFirst = vi.fn()
const designUpdate = vi.fn()
const cardFindFirst = vi.fn()
const assertCardAccess = vi.fn()
const syncGoogleClass = vi.fn()
const pushAppleWalletUpdateForCard = vi.fn()

vi.mock('@/lib/db', () => ({
  prisma: {
    cardDesign: {
      findMany: (...a: unknown[]) => designFindMany(...a),
      findFirst: (...a: unknown[]) => designFindFirst(...a),
      update: (...a: unknown[]) => designUpdate(...a),
    },
    card: { findFirst: (...a: unknown[]) => cardFindFirst(...a) },
    $transaction: (ops: unknown) => Promise.all(ops as Promise<unknown>[]),
  },
}))
vi.mock('@/lib/auth/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/session')>()),
  assertCardAccess: (...a: unknown[]) => assertCardAccess(...a),
}))
vi.mock('@/lib/wallet/google-sync', () => ({
  syncGoogleClass: (...a: unknown[]) => syncGoogleClass(...a),
}))
vi.mock('@/lib/wallet/apple-sync', () => ({
  pushAppleWalletUpdateForCard: (...a: unknown[]) => pushAppleWalletUpdateForCard(...a),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { setGeoNotificationsAction } = await import('@/actions/card-design')

const CARD_ID = 'cl0000000000000000000000'
const LOCATION = {
  id: 'g0',
  label: 'Café Nord',
  latitude: 53.55,
  longitude: 10.0,
  maxDistance: 150,
  relevantText: 'Deine Stempelkarte ist bereit',
}

/** Eine Karte mit hinterlegtem Standort, beide Design-Zeilen. */
function withLocations(locations: unknown[]) {
  designFindMany.mockResolvedValue([
    { id: 'd_draft', geoLocations: locations },
    { id: 'd_published', geoLocations: locations },
  ])
}

/** Was `loadPublishedDesign` nach dem Schreiben zurückgibt. */
function publishedRow(enabled: boolean, locations: unknown[]) {
  designFindFirst.mockResolvedValue({
    ...designToRow({
      ...DEFAULT_CARD_DESIGN,
      geoNotificationsEnabled: enabled,
      geoLocations: locations as never,
    }),
    id: 'd_published',
    cardId: CARD_ID,
    status: 'PUBLISHED',
    version: 3,
    contrastOverrideBy: null,
    contrastOverrideAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  assertCardAccess.mockResolvedValue({ cardId: CARD_ID, session: { userId: 'u1' } })
  designUpdate.mockImplementation((args: { where: { id: string } }) => Promise.resolve(args.where))
  cardFindFirst.mockResolvedValue({
    name: 'Bäckerkarte',
    kind: 'STAMP',
    org: { name: 'Café Nord', latitude: 53.55, longitude: 10.0 },
  })
})

describe('setGeoNotificationsAction', () => {
  it('schaltet ab, ohne die Standorte mitzunehmen', async () => {
    withLocations([LOCATION])
    publishedRow(false, [LOCATION])

    const result = await setGeoNotificationsAction({ cardId: CARD_ID, enabled: false })

    expect(result.success).toBe(true)
    expect(designUpdate).toHaveBeenCalledTimes(2)
    for (const call of designUpdate.mock.calls) {
      const data = (call[0] as { data: { geoNotificationsEnabled: boolean; geoLocations: unknown[] } })
        .data
      expect(data.geoNotificationsEnabled).toBe(false)
      expect(data.geoLocations).toHaveLength(1)
    }
  })

  it('zieht die Wallets nach, sonst benachrichtigt eine abgeschaltete Karte weiter', async () => {
    withLocations([LOCATION])
    publishedRow(false, [LOCATION])

    await setGeoNotificationsAction({ cardId: CARD_ID, enabled: false })

    expect(syncGoogleClass).toHaveBeenCalledTimes(1)
    expect(pushAppleWalletUpdateForCard).toHaveBeenCalledWith(CARD_ID)
  })

  it('legt beim Einschalten den Standort des Betriebs an, wenn keiner hinterlegt ist', async () => {
    withLocations([])
    publishedRow(true, [LOCATION])

    const result = await setGeoNotificationsAction({ cardId: CARD_ID, enabled: true })

    expect(result.success).toBe(true)
    const data = (
      designUpdate.mock.calls[0]![0] as {
        data: { geoNotificationsEnabled: boolean; geoLocations: Array<{ latitude: number }> }
      }
    ).data
    expect(data.geoNotificationsEnabled).toBe(true)
    expect(data.geoLocations[0]!.latitude).toBe(53.55)
  })

  it('verweigert das Einschalten, wenn weder Karte noch Betrieb einen Standort kennen', async () => {
    withLocations([])
    cardFindFirst.mockResolvedValue({
      name: 'Bäckerkarte',
      kind: 'STAMP',
      org: { name: 'Café Nord', latitude: null, longitude: null },
    })

    const result = await setGeoNotificationsAction({ cardId: CARD_ID, enabled: true })

    expect(result.success).toBe(false)
    expect(result.error?.message).toContain('kein Standort hinterlegt')
    // Nichts geschrieben: ein Schalter, der „an" steht und nichts tut, wäre schlimmer als
    // die Fehlermeldung.
    expect(designUpdate).not.toHaveBeenCalled()
    expect(pushAppleWalletUpdateForCard).not.toHaveBeenCalled()
  })
})
