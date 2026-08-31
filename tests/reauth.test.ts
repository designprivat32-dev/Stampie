import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Die Passwort-Rückfrage vor den beiden unwiderruflichen Aktionen.
 *
 * Der Punkt dieser Sperre ist, dass eine offene Sitzung nicht genügt. Jeder Test hier hält
 * einen Weg fest, auf dem sie versehentlich wieder durchlässig würde.
 */

const findUnique = vi.fn()
vi.mock('@/lib/db', () => ({ prisma: { user: { findUnique: (...a: unknown[]) => findUnique(...a) } } }))

const requireSession = vi.fn()
// Nur die Sitzung austauschen: die Fehlerklasse muss dieselbe bleiben, sonst schlägt das
// `instanceof` in `guarded` fehl.
vi.mock('@/lib/auth/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/session')>()),
  requireSession: (...a: unknown[]) => requireSession(...a),
}))

import { PasswordConfirmationError } from '@/lib/auth/session'
import { hashPassword } from '@/lib/auth/password'
import { resetRateLimits } from '@/lib/rate-limit'
import { assertPassword } from '@/lib/auth/reauth'

const RICHTIG = 'Sonnenschein!2026'
let hash: string

beforeEach(async () => {
  vi.clearAllMocks()
  resetRateLimits()
  hash ??= await hashPassword(RICHTIG)
  requireSession.mockResolvedValue({ userId: 'u1', email: 'op@stampie.de', name: null })
  findUnique.mockResolvedValue({ passwordHash: hash })
  vi.stubEnv('NODE_ENV', 'production')
})
afterEach(() => vi.unstubAllEnvs())

describe('assertPassword', () => {
  it('lässt das richtige Passwort durch', async () => {
    await expect(assertPassword(RICHTIG, 'card-delete')).resolves.toBeUndefined()
  })

  it('weist ein falsches Passwort ab', async () => {
    await expect(assertPassword('falsch', 'card-delete')).rejects.toBeInstanceOf(
      PasswordConfirmationError,
    )
  })

  it('weist Leerstring und Nicht-Strings ab, ohne die Datenbank zu fragen', async () => {
    for (const wert of ['', null, undefined, 42, {}]) {
      await expect(assertPassword(wert, 'card-delete')).rejects.toBeInstanceOf(
        PasswordConfirmationError,
      )
    }
    expect(findUnique).not.toHaveBeenCalled()
  })

  it('verlangt eine Sitzung, bevor überhaupt geprüft wird', async () => {
    requireSession.mockRejectedValue(new Error('Nicht angemeldet.'))
    await expect(assertPassword(RICHTIG, 'card-delete')).rejects.toThrow()
    expect(findUnique).not.toHaveBeenCalled()
  })

  it('greift nach zu vielen Fehlversuchen', async () => {
    for (let i = 0; i < 10; i++) {
      await expect(assertPassword('falsch', 'card-delete')).rejects.toBeInstanceOf(
        PasswordConfirmationError,
      )
    }
    // Auch das richtige Passwort kommt jetzt nicht mehr durch.
    await expect(assertPassword(RICHTIG, 'card-delete')).rejects.toThrow(/Zu viele Versuche/)
  })

  it('sperrt pro Aktion getrennt', async () => {
    for (let i = 0; i < 10; i++) {
      await expect(assertPassword('falsch', 'card-delete')).rejects.toBeInstanceOf(
        PasswordConfirmationError,
      )
    }
    // Die andere Aktion hat einen eigenen Zähler.
    await expect(assertPassword(RICHTIG, 'handout-disable')).resolves.toBeUndefined()
  })

  it('verweigert in Produktion ein Konto ohne hinterlegtes Passwort', async () => {
    findUnique.mockResolvedValue({ passwordHash: null })
    await expect(assertPassword('egal', 'card-delete')).rejects.toBeInstanceOf(
      PasswordConfirmationError,
    )
  })

  it('lässt die Entwickler-Sitzung ohne Passwort nur ausserhalb der Produktion durch', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    findUnique.mockResolvedValue({ passwordHash: null })
    await expect(assertPassword('egal', 'card-delete')).resolves.toBeUndefined()
  })
})
