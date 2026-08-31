import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Löschen einer Karte.
 *
 * Der Test hält drei Dinge fest, die beim Umbau leicht verloren gehen: dass wirklich
 * gelöscht und nicht nur ein Feld gesetzt wird, dass die Mandantenprüfung davor steht, und
 * dass ohne bestätigtes Passwort nichts passiert. Ein Löschen ohne diese Prüfungen wäre die
 * teuerste Lücke im ganzen Projekt — fremde Kundenkarten samt Historie sind mit einer cuid
 * weg.
 */

const cardDelete = vi.fn()
const cardUpdate = vi.fn()
const assertCardAccess = vi.fn()
const revalidatePath = vi.fn()
const assertPassword = vi.fn()

vi.mock('@/lib/db', () => ({
  prisma: {
    card: {
      delete: (...a: unknown[]) => cardDelete(...a),
      update: (...a: unknown[]) => cardUpdate(...a),
    },
  },
}))
// Nur den Zugriffscheck austauschen: `guarded` erkennt die Fehlerklassen aus demselben
// Modul per `instanceof`, ein vollständiger Ersatz würde sie mit undefined überschreiben.
vi.mock('@/lib/auth/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/session')>()),
  assertCardAccess: (...a: unknown[]) => assertCardAccess(...a),
}))
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))
vi.mock('@/lib/auth/reauth', () => ({
  assertPassword: (...a: unknown[]) => assertPassword(...a),
}))

const { deleteCardAction } = await import('@/actions/cards')

const CARD_ID = 'cl0000000000000000000000'
const PASSWORT = 'richtiges-passwort'

beforeEach(() => {
  vi.clearAllMocks()
  assertCardAccess.mockResolvedValue({ cardId: CARD_ID })
  assertPassword.mockResolvedValue(undefined)
  cardDelete.mockResolvedValue({ id: CARD_ID })
})

describe('deleteCardAction', () => {
  it('deletes the row instead of flagging it', async () => {
    const result = await deleteCardAction(CARD_ID, PASSWORT)

    expect(result.success).toBe(true)
    expect(cardDelete).toHaveBeenCalledWith({ where: { id: CARD_ID } })
    // Kein Archiv mehr: nichts wird stillgelegt, das Aufräumen erledigen die Fremdschlüssel.
    expect(cardUpdate).not.toHaveBeenCalled()
  })

  it('checks tenancy before deleting', async () => {
    assertCardAccess.mockRejectedValue(new Error('Kein Zugriff auf diese Karte.'))

    const result = await deleteCardAction(CARD_ID, PASSWORT)

    expect(result.success).toBe(false)
    expect(cardDelete).not.toHaveBeenCalled()
  })

  it('refuses an id that is not a card id', async () => {
    const result = await deleteCardAction('../../etc/passwd', PASSWORT)

    expect(result.success).toBe(false)
    expect(assertCardAccess).not.toHaveBeenCalled()
    expect(cardDelete).not.toHaveBeenCalled()
  })

  it('demands the password, and only after the tenancy check', async () => {
    await deleteCardAction(CARD_ID, PASSWORT)

    expect(assertPassword).toHaveBeenCalledWith(PASSWORT, 'card-delete')
    // Reihenfolge: erst Zugriff, dann Passwort — sonst verriete eine Fehlermeldung, welche
    // Karten-ids überhaupt existieren.
    expect(assertCardAccess.mock.invocationCallOrder[0]).toBeLessThan(
      assertPassword.mock.invocationCallOrder[0]!,
    )
  })

  it('deletes nothing when the password is wrong', async () => {
    const { PasswordConfirmationError } = await import('@/lib/auth/session')
    assertPassword.mockRejectedValue(new PasswordConfirmationError())

    const result = await deleteCardAction(CARD_ID, 'falsch')

    expect(result.success).toBe(false)
    expect(cardDelete).not.toHaveBeenCalled()
    // Am Feld markierbar, damit der Dialog die Meldung nicht als Banner zeigen muss.
    if (!result.success) expect(result.error.fields?.password).toBeTruthy()
  })

  it('refreshes the overview so the tile disappears', async () => {
    await deleteCardAction(CARD_ID, PASSWORT)

    expect(revalidatePath).toHaveBeenCalledWith('/dashboard/karten')
  })
})
