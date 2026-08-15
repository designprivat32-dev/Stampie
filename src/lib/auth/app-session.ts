import 'server-only'
import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/db'
import type { MemberRole } from '@/lib/auth/session'

/**
 * Token sessions for the business app.
 *
 * The web app uses cookie/server-component auth; the native app cannot, so it authenticates
 * with a bearer token it receives on login and sends in the `Authorization` header.
 */

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30 // 30 days

export interface AppUser {
  userId: string
  username: string | null
  name: string | null
  orgId: string
  orgName: string
  role: MemberRole
  mustChangePassword: boolean
}

export async function createAppSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex')
  await prisma.appSession.create({
    data: { token, userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  })
  return token
}

export async function destroyAppSession(token: string): Promise<void> {
  await prisma.appSession.deleteMany({ where: { token } })
}

/** Reads the Bearer token from a request's Authorization header. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (!header) return null
  const [scheme, value] = header.split(' ')
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !value) return null
  return value.trim() || null
}

/** Resolves a token to the business user + their organisation, or null. */
export async function resolveAppUser(token: string | null): Promise<AppUser | null> {
  if (!token) return null

  const session = await prisma.appSession.findUnique({
    where: { token },
    select: {
      expiresAt: true,
      user: {
        select: {
          id: true,
          username: true,
          name: true,
          mustChangePassword: true,
          memberships: {
            take: 1,
            select: { orgId: true, role: true, org: { select: { name: true } } },
          },
        },
      },
    },
  })

  if (!session || session.expiresAt.getTime() < Date.now()) return null

  const membership = session.user.memberships[0]
  if (!membership) return null

  return {
    userId: session.user.id,
    username: session.user.username,
    name: session.user.name,
    orgId: membership.orgId,
    orgName: membership.org.name,
    role: membership.role as MemberRole,
    mustChangePassword: session.user.mustChangePassword,
  }
}

/** Convenience: resolve the app user straight from a request. */
export async function requireAppUser(request: Request): Promise<AppUser | null> {
  return resolveAppUser(bearerToken(request))
}
