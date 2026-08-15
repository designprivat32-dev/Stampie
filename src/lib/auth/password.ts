import 'server-only'
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

/**
 * Password hashing with Node's built-in scrypt — no external dependency, works on
 * serverless. Stored format: `scrypt$<saltHex>$<hashHex>`.
 */

const scryptAsync = promisify(scrypt)
const KEYLEN = 64

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const derived = (await scryptAsync(plain, salt, KEYLEN)) as Buffer
  return `scrypt$${salt}$${derived.toString('hex')}`
}

export async function verifyPassword(plain: string, stored: string | null): Promise<boolean> {
  if (!stored) return false
  const parts = stored.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const salt = parts[1]
  const hashHex = parts[2]
  if (!salt || !hashHex) return false

  const derived = (await scryptAsync(plain, salt, KEYLEN)) as Buffer
  const expected = Buffer.from(hashHex, 'hex')
  if (expected.length !== derived.length) return false
  return timingSafeEqual(expected, derived)
}
