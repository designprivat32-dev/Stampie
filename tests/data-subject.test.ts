import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Auskunft und Löschung zu einer einzelnen Karte.
 *
 * Zwei Dinge hält dieser Test fest: dass eine geratene Kartennummer keine fremde Karte
 * offenlegt, und dass ohne bestätigtes Passwort nichts verschwindet. Beides sind Wege, auf
 * denen aus einem Auskunftswerkzeug ein Datenleck wird.
 */

const passFindFirst = vi.fn()
const passDelete = vi.fn()
const eventFindMany = vi.fn()
const appleCount = vi.fn()
const deliveryCount = vi.fn()

vi.mock('@/lib/db', () => ({
  prisma: {
    issuedPass: {
      findFirst: (...a: unknown[]) => passFindFirst(...a),
      delete: (...a: unknown[]) => passDelete(...a),
    },
    stampEvent: { findMany: (...a: unknown[]) => eventFindMany(...a) },
    appleDeviceRegistration: { count: (...a: unknown[]) => appleCount(...a) },
    cardReminderDelivery: { count: (...a: unknown[]) => deliveryCount(...a) },
  },
}))

const assertCardAccess = vi.fn()
vi.mock('@/lib/auth/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/session')>()),
  assertCardAccess: (...a: unknown[]) => assertCardAccess(...a),
}))

const assertPassword = vi.fn()
vi.mock('@/lib/auth/reauth', () => ({
  assertPassword: (...a: unknown[]) => assertPassword(...a),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { deletePassDataAction, lookupPassAction } = await import('@/actions/data-subject')

const SERIAL = 'K-3D92C1DD4CAC'
const PASSWORT = 'richtig'

const passRow = {
  id: 'p1',
  serial: SERIAL,
  kind: 'STAMP',
  isTest: false,
  stamps: 3,
  stampGoal: 10,
  rewardCount: 0,
  createdAt: new Date('2026-08-01T10:00:00Z'),
  updatedAt: new Date('2026-08-20T10:00:00Z'),
  lastRewardAt: null,
  redeemedAt: null,
  activeMessage: null,
  cardId: 'c1',
  card: { name: 'Hairlight by Rejin', org: { name: 'Hairlight by Rejin' } },
}

beforeEach(() => {
  vi.clearAllMocks()
  passFindFirst.mockResolvedValue(passRow)
  eventFindMany.mockResolvedValue([
    { kind: 'STAMP', delta: 1, balance: 3, createdAt: new Date('2026-08-20T10:00:00Z') },
  ])
  appleCount.mockResolvedValue(1)
  deliveryCount.mockResolvedValue(0)
  assertCardAccess.mockResolvedValue({ cardId: 'c1' })
  assertPassword.mockResolvedValue(undefined)
  passDelete.mockResolvedValue({ id: 'p1' })
})

describe('lookupPassAction', () => {
  it('gibt zurück, was zu der Karte gespeichert ist', async () => {
    const result = await lookupPassAction(SERIAL)

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.serial).toBe(SERIAL)
    expect(result.data.stamps).toBe(3)
    expect(result.data.appleDevices).toBe(1)
    expect(result.data.events).toHaveLength(1)
  })

  it('sucht in Großschreibung, egal wie der Betrieb tippt', async () => {
    await lookupPassAction('  k-3d92c1dd4cac  ')
    expect(passFindFirst.mock.calls[0]![0].where).toEqual({ serial: SERIAL })
  })

  it('prüft die Mandantenzugehörigkeit, bevor es Daten herausgibt', async () => {
    assertCardAccess.mockRejectedValue(new Error('Karte nicht gefunden.'))

    const result = await lookupPassAction(SERIAL)

    expect(result.success).toBe(false)
    // Die Historie wird erst nach der Prüfung geladen.
    expect(eventFindMany).not.toHaveBeenCalled()
  })

  it('meldet eine unbekannte Nummer, ohne die Zugriffsprüfung zu bemühen', async () => {
    passFindFirst.mockResolvedValue(null)

    const result = await lookupPassAction(SERIAL)

    expect(result.success).toBe(false)
    expect(assertCardAccess).not.toHaveBeenCalled()
  })

  it('weist eine leere Eingabe ab', async () => {
    expect((await lookupPassAction('  ')).success).toBe(false)
    expect(passFindFirst).not.toHaveBeenCalled()
  })
})

describe('deletePassDataAction', () => {
  it('löscht die Karte, nachdem Zugriff und Passwort geprüft sind', async () => {
    const result = await deletePassDataAction(SERIAL, PASSWORT)

    expect(result.success).toBe(true)
    expect(assertPassword).toHaveBeenCalledWith(PASSWORT, 'pass-delete')
    expect(passDelete).toHaveBeenCalledWith({ where: { id: 'p1' } })
    expect(assertCardAccess.mock.invocationCallOrder[0]).toBeLessThan(
      assertPassword.mock.invocationCallOrder[0]!,
    )
  })

  it('löscht nichts, wenn das Passwort nicht stimmt', async () => {
    const { PasswordConfirmationError } = await import('@/lib/auth/session')
    assertPassword.mockRejectedValue(new PasswordConfirmationError())

    const result = await deletePassDataAction(SERIAL, 'falsch')

    expect(result.success).toBe(false)
    expect(passDelete).not.toHaveBeenCalled()
  })

  it('löscht nichts bei fehlender Mandantenzugehörigkeit', async () => {
    assertCardAccess.mockRejectedValue(new Error('Karte nicht gefunden.'))

    const result = await deletePassDataAction(SERIAL, PASSWORT)

    expect(result.success).toBe(false)
    expect(assertPassword).not.toHaveBeenCalled()
    expect(passDelete).not.toHaveBeenCalled()
  })
})
