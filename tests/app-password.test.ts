import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from '@/lib/auth/password'

describe('password hashing (scrypt)', () => {
  it('produces a scrypt$salt$hash string', async () => {
    const hash = await hashPassword('geheim123')
    const parts = hash.split('$')
    expect(parts).toHaveLength(3)
    expect(parts[0]).toBe('scrypt')
    expect(parts[1]).toMatch(/^[0-9a-f]+$/) // salt hex
    expect(parts[2]).toMatch(/^[0-9a-f]+$/) // hash hex
  })

  it('verifies the correct password', async () => {
    const hash = await hashPassword('Sonnenschein!')
    expect(await verifyPassword('Sonnenschein!', hash)).toBe(true)
  })

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('Sonnenschein!')
    expect(await verifyPassword('sonnenschein!', hash)).toBe(false)
    expect(await verifyPassword('falsch', hash)).toBe(false)
    expect(await verifyPassword('', hash)).toBe(false)
  })

  it('rejects when no hash is stored', async () => {
    expect(await verifyPassword('egal', null)).toBe(false)
  })

  it('rejects a malformed stored value', async () => {
    expect(await verifyPassword('egal', 'not-a-valid-hash')).toBe(false)
    expect(await verifyPassword('egal', 'bcrypt$abc$def')).toBe(false)
  })

  it('uses a random salt (two hashes of the same password differ)', async () => {
    const a = await hashPassword('gleich')
    const b = await hashPassword('gleich')
    expect(a).not.toBe(b)
    // …but both still verify.
    expect(await verifyPassword('gleich', a)).toBe(true)
    expect(await verifyPassword('gleich', b)).toBe(true)
  })
})
