import 'server-only'
import { prisma } from '@/lib/db'
import { isOperatorEmail } from '@/lib/auth/operators'

/**
 * The dashboard's session gate.
 *
 * A session is a signed-in operator, resolved from an httpOnly cookie — see
 * `lib/auth/dashboard-session.ts` for the cookie and `lib/auth/operators.ts` for who
 * counts as one. Everything downstream only ever talks to this module.
 *
 * The session only answers *who* is calling. What they may reach is `assertCardAccess`:
 * every server action and every page load goes through it, and every Prisma query
 * additionally filters by `cardId`, so no design is reachable through a guessed id.
 */

export interface Session {
  userId: string
  email: string
  name: string | null
  /** Set by `scripts/dashboard-user.mts`; the dashboard sends these sessions to /dashboard/konto. */
  mustChangePassword: boolean
}

/**
 * The password was not re-entered, or not correctly, in front of an irreversible action.
 * See `lib/auth/reauth.ts` for which actions ask and why.
 */
export class PasswordConfirmationError extends Error {
  constructor(message = 'Passwort falsch.') {
    super(message)
    this.name = 'PasswordConfirmationError'
  }
}

export class UnauthorizedError extends Error {
  constructor(message = 'Nicht angemeldet.') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

/**
 * Thrown both when the card does not exist and when the user has no access to it — the
 * caller turns this into a 404 so a guessed id cannot be used to probe for existence.
 */
export class CardAccessError extends Error {
  constructor(message = 'Karte nicht gefunden.') {
    super(message)
    this.name = 'CardAccessError'
  }
}

export async function getSession(): Promise<Session | null> {
  // Imported lazily: this module is pulled in for its error classes all over the codebase,
  // unit tests included, and the cookie store must not be touched at import time.
  const { resolveDashboardSession } = await import('@/lib/auth/dashboard-session')
  return (await resolveDashboardSession()) ?? devSession()
}

/**
 * Local-development convenience: be `DEV_SESSION_USER_EMAIL` without signing in.
 *
 * Hard-gated on a non-production build. This used to be the *only* auth the dashboard
 * had, so leaving it reachable in production would defeat the login entirely.
 */
async function devSession(): Promise<Session | null> {
  if (process.env.NODE_ENV === 'production') return null
  const email = process.env.DEV_SESSION_USER_EMAIL
  if (!email) return null
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) return null
  // Never forces a change locally — the dev shortcut has no password to begin with.
  return { userId: user.id, email: user.email, name: user.name, mustChangePassword: false }
}

export async function requireSession(): Promise<Session> {
  const session = await getSession()
  if (!session) throw new UnauthorizedError()
  return session
}

export type MemberRole = 'OWNER' | 'MEMBER' | 'AGENCY'

export interface CardAccess {
  session: Session
  cardId: string
  /** Null while the card has not been handed to a customer yet. */
  orgId: string | null
  /** The role through which access was granted. */
  role: MemberRole
  /**
   * Agency staff design cards on the customer's behalf but must not book stamps — a stamp
   * is worth money and belongs to whoever sold something.
   */
  canStamp: boolean
}

export class StampPermissionError extends Error {
  constructor(
    message = 'Stempel dürfen nur vom Betrieb selbst gebucht werden, nicht vom Agentur-Zugang.',
  ) {
    super(message)
    this.name = 'StampPermissionError'
  }
}

/**
 * Whether this session administers every customer.
 *
 * Every operator administers every customer. That is not a loosening: holding a session
 * at all now requires being on the `DASHBOARD_ADMIN_EMAILS` allowlist, and that list
 * exists precisely to name the few people who run all the customers' cards. A business
 * login is never on it — see `lib/auth/operators.ts`.
 * Tying card assignment to an AGENCY row meant a freshly created login could add customers
 * but not hand a card to one, which is not a rule anyone chose.
 *
 * This does not widen what a *customer* sees. Their logins go through the app API
 * (`lib/auth/app-session.ts`), which scopes every query to their own `orgId` and never
 * touches this function.
 *
 * Deliberately a function rather than an inlined `true`: when real dashboard auth lands,
 * this is the single place that decides who administers all customers.
 */
export async function isAdminSession(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
  return isOperatorEmail(user?.email)
}

/**
 * The tenancy gate for cards.
 *
 * The dashboard operator reaches every card, including ones not yet assigned to a
 * customer — see `isAdminSession`. Everyone else reaches only cards belonging to an
 * organisation they are a member of. A card that does not resolve is reported as missing,
 * never as forbidden — otherwise a guessed id would confirm that it exists.
 */
export async function assertCardAccess(cardId: string): Promise<CardAccess> {
  const session = await requireSession()

  const card = await prisma.card.findFirst({
    where: { id: cardId },
    select: { id: true, orgId: true },
  })
  if (!card) throw new CardAccessError('Karte nicht gefunden.')

  if (await isAdminSession(session.userId)) {
    // Single-operator setup: the operator also runs the till, so they may stamp assigned
    // cards. (Unassigned cards still cannot be stamped — assertStampAccess checks orgId.)
    return { session, cardId: card.id, orgId: card.orgId, role: 'AGENCY', canStamp: card.orgId !== null }
  }

  if (!card.orgId) throw new CardAccessError('Karte nicht gefunden.')

  const membership = await prisma.membership.findFirst({
    where: { userId: session.userId, orgId: card.orgId },
    select: { role: true },
  })
  if (!membership) throw new CardAccessError('Karte nicht gefunden.')

  return {
    session,
    cardId: card.id,
    orgId: card.orgId,
    role: membership.role as MemberRole,
    canStamp: true,
  }
}

/** Same gate, but refuses when the caller may not book stamps. */
export async function assertStampAccess(cardId: string): Promise<CardAccess> {
  const access = await assertCardAccess(cardId)
  if (!access.canStamp) throw new StampPermissionError()
  if (!access.orgId) {
    throw new StampPermissionError(
      'Diese Karte ist noch keinem Betrieb zugewiesen und kann deshalb nicht gestempelt werden.',
    )
  }
  return access
}
