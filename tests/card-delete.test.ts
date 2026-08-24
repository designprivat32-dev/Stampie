import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Löschen einer Karte.
 *
 * Der Test hält zwei Dinge fest, die beim Umbau vom Archiv zum echten Löschen leicht
 * verloren gehen: dass wirklich gelöscht und nicht nur ein Feld gesetzt wird, und dass die
 * Mandantenprüfung davor steht. Ein Löschen ohne diese Prüfung wäre die teuerste Lücke im
 * ganzen Projekt — fremde Kundenkarten samt Historie sind mit einer cuid weg.
 */

const cardDelete = vi.fn()
const cardUpdate = vi.fn()
const assertCardAccess = vi.fn()
const revalidatePath = vi.fn()

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

const { deleteCardAction } = await import('@/actions/cards')

const CARD_ID = 'cl0000000000000000000000'

beforeEach(() => {
  vi.clearAllMocks()
  assertCardAccess.mockResolvedValue({ cardId: CARD_ID })
  cardDelete.mockResolvedValue({ id: CARD_ID })
})

describe('deleteCardAction', () => {
  it('deletes the row instead of flagging it', async () => {
    const result = await deleteCardAction(CARD_ID)

    expect(result.success).toBe(true)
    expect(cardDelete).toHaveBeenCalledWith({ where: { id: CARD_ID } })
    // Kein Archiv mehr: nichts wird stillgelegt, das Aufräumen erledigen die Fremdschlüssel.
    expect(cardUpdate).not.toHaveBeenCalled()
  })

  it('checks tenancy before deleting', async () => {
    assertCardAccess.mockRejectedValue(new Error('Kein Zugriff auf diese Karte.'))

    const result = await deleteCardAction(CARD_ID)

    expect(result.success).toBe(false)
    expect(cardDelete).not.toHaveBeenCalled()
  })

  it('refuses an id that is not a card id', async () => {
    const result = await deleteCardAction('../../etc/passwd')

    expect(result.success).toBe(false)
    expect(assertCardAccess).not.toHaveBeenCalled()
    expect(cardDelete).not.toHaveBeenCalled()
  })

  it('refreshes the overview so the tile disappears', async () => {
    await deleteCardAction(CARD_ID)

    expect(revalidatePath).toHaveBeenCalledWith('/dashboard/karten')
  })
})
