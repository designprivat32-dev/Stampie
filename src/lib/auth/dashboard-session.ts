import 'server-only'
import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/db'
import { isOperatorEmail } from '@/lib/auth/operators'
import { DASHBOARD_COOKIE, DASHBOARD_TOKEN_PREFIX, isDashboardToken } from '@/lib/auth/dashboard-cookie'
import type { Session } from '@/lib/auth/session'

/**
 * Cookie sessions for the operator dashboard.
 *
 * Rides on the existing `AppSession` table rather than a new one — the schema is already
 * deployed and the shape (token, userId, expiresAt) is exactly what a cookie session
 * needs.
 *
 * Because the table is shared with the native business app, dashboard tokens carry a
 * `dash_` prefix and the two resolvers refuse each other's tokens. Without that, a stolen
 * dashboard cookie would work as an app bearer token, and an app token pasted into a
 * cookie would open the dashboard.
 */

export { DASHBOARD_COOKIE, DASHBOARD_TOKEN_PREFIX, isDashboardToken }

/** Shorter than the app's 30 days: the dashboard sees every customer. */
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7

/**
 * `next/headers` is imported lazily so this module can be pulled into unit tests (and into
 * `session.ts`, which half the codebase imports for its error classes) without dragging
 * the Next request context along.
 */
async function cookieStore() {
  const { cookies } = await import('next/headers')
  return cookies()
}

/** Issues a session and sets the cookie. The caller has already verified the password. */
export async function createDashboardSession(userId: string): Promise<void> {
  const token = DASHBOARD_TOKEN_PREFIX + randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)

  await prisma.appSession.create({ data: { token, userId, expiresAt } })

  const store = await cookieStore()
  store.set(DASHBOARD_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  })
}

/** Drops the session row and the cookie. Safe to call when not signed in. */
export async function destroyDashboardSession(): Promise<void> {
  const store = await cookieStore()
  const token = store.get(DASHBOARD_COOKIE)?.value ?? null
  if (token) await prisma.appSession.deleteMany({ where: { token } })
  store.delete(DASHBOARD_COOKIE)
}

/**
 * Resolves the cookie to an operator, or null.
 *
 * The allowlist is re-checked on every request rather than trusted from login time, so
 * removing an address from `DASHBOARD_ADMIN_EMAILS` revokes access on the next request
 * instead of whenever the session happens to expire.
 */
export async function resolveDashboardSession(): Promise<Session | null> {
  const store = await cookieStore()
  const token = store.get(DASHBOARD_COOKIE)?.value ?? null
  if (!isDashboardToken(token)) return null

  const session = await prisma.appSession.findUnique({
    where: { token: token as string },
    select: {
      expiresAt: true,
      user: { select: { id: true, email: true, name: true } },
    },
  })
  if (!session || session.expiresAt.getTime() < Date.now()) return null
  if (!isOperatorEmail(session.user.email)) return null

  return { userId: session.user.id, email: session.user.email, name: session.user.name }
}

/** Removes expired rows for this user; called on login so the table does not grow forever. */
export async function pruneExpiredSessions(userId: string): Promise<void> {
  await prisma.appSession.deleteMany({ where: { userId, expiresAt: { lt: new Date() } } })
}
