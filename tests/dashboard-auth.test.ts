import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The dashboard's access rule and the separation between dashboard cookies and the native
 * app's bearer tokens. Both are the kind of thing that fails silently and expensively: an
 * over-permissive allowlist hands one customer every other customer's data, and a shared
 * token namespace lets a stolen cookie act as an app credential.
 */

const findUnique = vi.fn()
const deleteMany = vi.fn()
vi.mock('@/lib/db', () => ({
  prisma: {
    appSession: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      deleteMany: (...a: unknown[]) => deleteMany(...a),
    },
  },
}))

const cookieGet = vi.fn()
vi.mock('next/headers', () => ({ cookies: async () => ({ get: cookieGet }) }))

import { isOperatorEmail, parseOperatorEmails } from '@/lib/auth/operators'
import { DASHBOARD_TOKEN_PREFIX, isDashboardToken } from '@/lib/auth/dashboard-cookie'
import { dropDashboardSessions, resolveDashboardSession } from '@/lib/auth/dashboard-session'
import { resolveAppUser } from '@/lib/auth/app-session'

describe('parseOperatorEmails', () => {
  it('splits on commas, semicolons and whitespace', () => {
    expect(parseOperatorEmails('a@x.de, b@x.de;c@x.de d@x.de')).toEqual([
      'a@x.de',
      'b@x.de',
      'c@x.de',
      'd@x.de',
    ])
  })

  it('lower-cases and de-duplicates', () => {
    expect(parseOperatorEmails('Demo@Stampie.de, demo@stampie.de')).toEqual(['demo@stampie.de'])
  })

  it('is empty for unset, blank and separator-only values', () => {
    expect(parseOperatorEmails(undefined)).toEqual([])
    expect(parseOperatorEmails('')).toEqual([])
    expect(parseOperatorEmails('   ')).toEqual([])
    expect(parseOperatorEmails(' , ; ')).toEqual([])
  })
})

describe('isOperatorEmail', () => {
  it('admits an address on the list, ignoring case and padding', () => {
    expect(isOperatorEmail('demo@stampie.de', 'demo@stampie.de')).toBe(true)
    expect(isOperatorEmail('  Demo@Stampie.DE  ', 'demo@stampie.de')).toBe(true)
  })

  it('refuses an address that is not on the list', () => {
    expect(isOperatorEmail('hairlight-by-rejin@login.stampie.local', 'demo@stampie.de')).toBe(false)
  })

  it('fails closed when the list is unset or empty', () => {
    expect(isOperatorEmail('demo@stampie.de', undefined)).toBe(false)
    expect(isOperatorEmail('demo@stampie.de', '')).toBe(false)
  })

  it('refuses a missing address', () => {
    expect(isOperatorEmail(null, 'demo@stampie.de')).toBe(false)
    expect(isOperatorEmail(undefined, 'demo@stampie.de')).toBe(false)
  })
})

describe('token namespaces', () => {
  it('recognises only prefixed tokens as dashboard tokens', () => {
    expect(isDashboardToken(`${DASHBOARD_TOKEN_PREFIX}abc`)).toBe(true)
    expect(isDashboardToken('abc')).toBe(false)
    expect(isDashboardToken(null)).toBe(false)
  })

  it('refuses a dashboard cookie used as an app bearer token', async () => {
    await expect(resolveAppUser(`${DASHBOARD_TOKEN_PREFIX}stolen`)).resolves.toBeNull()
    // Rejected on shape alone — the session table is never consulted.
    expect(findUnique).not.toHaveBeenCalled()
  })
})

describe('resolveDashboardSession', () => {
  const future = () => new Date(Date.now() + 60_000)
  const operator = { id: 'u1', email: 'demo@stampie.de', name: 'Demo', mustChangePassword: false }

  beforeEach(() => {
    vi.stubEnv('DASHBOARD_ADMIN_EMAILS', 'demo@stampie.de')
    findUnique.mockReset()
    cookieGet.mockReset()
  })
  afterEach(() => vi.unstubAllEnvs())

  const withCookie = (value: string | undefined) =>
    cookieGet.mockReturnValue(value === undefined ? undefined : { value })

  it('resolves an operator with a valid cookie', async () => {
    withCookie(`${DASHBOARD_TOKEN_PREFIX}good`)
    findUnique.mockResolvedValue({ expiresAt: future(), user: operator })
    await expect(resolveDashboardSession()).resolves.toEqual({
      userId: 'u1',
      email: 'demo@stampie.de',
      name: 'Demo',
      mustChangePassword: false,
    })
  })

  it('carries the forced-change flag through', async () => {
    withCookie(`${DASHBOARD_TOKEN_PREFIX}good`)
    findUnique.mockResolvedValue({
      expiresAt: future(),
      user: { ...operator, mustChangePassword: true },
    })
    await expect(resolveDashboardSession()).resolves.toMatchObject({ mustChangePassword: true })
  })

  it('returns null without a cookie', async () => {
    withCookie(undefined)
    await expect(resolveDashboardSession()).resolves.toBeNull()
    expect(findUnique).not.toHaveBeenCalled()
  })

  it('refuses an app bearer token pasted into the cookie', async () => {
    withCookie('deadbeef')
    await expect(resolveDashboardSession()).resolves.toBeNull()
    expect(findUnique).not.toHaveBeenCalled()
  })

  it('refuses an expired session', async () => {
    withCookie(`${DASHBOARD_TOKEN_PREFIX}old`)
    findUnique.mockResolvedValue({ expiresAt: new Date(Date.now() - 1), user: operator })
    await expect(resolveDashboardSession()).resolves.toBeNull()
  })

  it('refuses a session whose user has been taken off the allowlist', async () => {
    withCookie(`${DASHBOARD_TOKEN_PREFIX}good`)
    findUnique.mockResolvedValue({
      expiresAt: future(),
      user: {
        id: 'u2',
        email: 'hairlight-by-rejin@login.stampie.local',
        name: 'Rejin',
        mustChangePassword: false,
      },
    })
    await expect(resolveDashboardSession()).resolves.toBeNull()
  })

  it('refuses everyone when the allowlist is empty', async () => {
    vi.stubEnv('DASHBOARD_ADMIN_EMAILS', '')
    withCookie(`${DASHBOARD_TOKEN_PREFIX}good`)
    findUnique.mockResolvedValue({ expiresAt: future(), user: operator })
    await expect(resolveDashboardSession()).resolves.toBeNull()
  })
})

describe('dropDashboardSessions', () => {
  it('ends only the dashboard sessions, never the app tokens', async () => {
    deleteMany.mockReset().mockResolvedValue({ count: 2 })
    await dropDashboardSessions('u1')
    expect(deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', token: { startsWith: DASHBOARD_TOKEN_PREFIX } },
    })
  })
})
