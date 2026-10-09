import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Löschen eines Kunden.
 *
 * Festgehalten wird: ohne bestätigtes Passwort passiert nichts, die App-Logins des Kunden
 * gehen mit, und Logins, die noch an einer anderen Firma hängen, bleiben.
 */

const orgFindFirst = vi.fn()
const orgDelete = vi.fn()
const userDeleteMany = vi.fn()
const requireSession = vi.fn()
const revalidatePath = vi.fn()
const assertPassword = vi.fn()

const tx = {
  organization: { delete: (...a: unknown[]) => orgDelete(...a) },
  user: { deleteMany: (...a: unknown[]) => userDeleteMany(...a) },
}

vi.mock('@/lib/db', () => ({
  prisma: {
    organization: { findFirst: (...a: unknown[]) => orgFindFirst(...a) },
    $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  },
}))
vi.mock('@/lib/auth/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/session')>()),
  requireSession: (...a: unknown[]) => requireSession(...a),
}))
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))
vi.mock('@/lib/auth/reauth', () => ({
  assertPassword: (...a: unknown[]) => assertPassword(...a),
}))
vi.mock('@/lib/geo/geocode', () => ({ geocodeAddress: vi.fn(), GeocodeError: class extends Error {} }))

const { deleteCustomerAction } = await import('@/actions/customers')

const ORG_ID = 'cl0000000000000000000000'
const PASSWORT = 'richtiges-passwort'

beforeEach(() => {
  vi.clearAllMocks()
  requireSession.mockResolvedValue({ userId: 'u1' })
  assertPassword.mockResolvedValue(undefined)
  orgFindFirst.mockResolvedValue({ id: ORG_ID })
  orgDelete.mockResolvedValue({ id: ORG_ID })
  userDeleteMany.mockResolvedValue({ count: 1 })
})

describe('deleteCustomerAction', () => {
  it('deletes the customer with the right password', async () => {
    const result = await deleteCustomerAction(ORG_ID, PASSWORT)

    expect(result.success).toBe(true)
    expect(assertPassword).toHaveBeenCalledWith(PASSWORT, 'customer-delete')
    expect(orgDelete).toHaveBeenCalledWith({ where: { id: ORG_ID } })
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard/kunden')
  })

  it('deletes nothing when the password is wrong', async () => {
    const { PasswordConfirmationError } = await import('@/lib/auth/session')
    assertPassword.mockRejectedValue(new PasswordConfirmationError())

    const result = await deleteCustomerAction(ORG_ID, 'falsch')

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.fields?.password).toBeTruthy()
    expect(orgDelete).not.toHaveBeenCalled()
    expect(userDeleteMany).not.toHaveBeenCalled()
  })

  it('refuses an id that is not a customer id', async () => {
    const result = await deleteCustomerAction('../../etc/passwd', PASSWORT)

    expect(result.success).toBe(false)
    expect(assertPassword).not.toHaveBeenCalled()
    expect(orgDelete).not.toHaveBeenCalled()
  })

  it('reports a missing customer instead of throwing', async () => {
    orgFindFirst.mockResolvedValue(null)

    const result = await deleteCustomerAction(ORG_ID, PASSWORT)

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.code).toBe('not_found')
    expect(orgDelete).not.toHaveBeenCalled()
  })

  it('removes only app logins that belong to no other customer', async () => {
    await deleteCustomerAction(ORG_ID, PASSWORT)

    expect(userDeleteMany).toHaveBeenCalledWith({
      where: {
        username: { not: null },
        memberships: { some: { orgId: ORG_ID }, every: { orgId: ORG_ID } },
      },
    })
    // Logins zuerst: danach gäbe es die Mitgliedschaften nicht mehr, über die sie gefunden werden.
    expect(userDeleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      orgDelete.mock.invocationCallOrder[0]!,
    )
  })
})
