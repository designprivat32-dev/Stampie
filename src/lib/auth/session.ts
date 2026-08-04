import 'server-only'
import { prisma } from '@/lib/db'

/**
 * STUB. The real auth layer lands separately; everything downstream only ever talks to
 * this module, so swapping the implementation is a one-file change.
 *
 * The important part is not the stub — it is `assertLocationAccess`. Every server action
 * and every page load goes through it, and every Prisma query additionally filters by
 * `locationId`, so no design is reachable through a guessed id.
 */

export interface Session {
  userId: string
  email: string
  name: string | null
}

export class UnauthorizedError extends Error {
  constructor(message = 'Nicht angemeldet.') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

/**
 * Thrown both when the location does not exist and when the user has no access to it —
 * the caller turns this into a 404 so a guessed id cannot be used to probe for existence.
 */
export class LocationAccessError extends Error {
  constructor(message = 'Standort nicht gefunden.') {
    super(message)
    this.name = 'LocationAccessError'
  }
}

export async function getSession(): Promise<Session | null> {
  const email = process.env.DEV_SESSION_USER_EMAIL
  if (!email) return null
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) return null
  return { userId: user.id, email: user.email, name: user.name }
}

export async function requireSession(): Promise<Session> {
  const session = await getSession()
  if (!session) throw new UnauthorizedError()
  return session
}

export interface LocationAccess {
  session: Session
  locationId: string
  orgId: string
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

/** True when the user holds an agency membership anywhere. */
export async function isAgency(userId: string): Promise<boolean> {
  const membership = await prisma.membership.findFirst({
    where: { userId, role: 'AGENCY' },
    select: { id: true },
  })
  return membership !== null
}

/**
 * The tenancy gate for cards.
 *
 * Agency members reach every card, including ones not yet assigned to a customer.
 * Everyone else reaches only cards belonging to an organisation they are a member of.
 * A card that does not resolve is reported as missing, never as forbidden — otherwise a
 * guessed id would confirm that it exists.
 */
export async function assertCardAccess(cardId: string): Promise<CardAccess> {
  const session = await requireSession()

  const card = await prisma.card.findFirst({
    where: { id: cardId },
    select: { id: true, orgId: true },
  })
  if (!card) throw new LocationAccessError('Karte nicht gefunden.')

  const agency = await isAgency(session.userId)
  if (agency) {
    return { session, cardId: card.id, orgId: card.orgId, role: 'AGENCY', canStamp: false }
  }

  if (!card.orgId) throw new LocationAccessError('Karte nicht gefunden.')

  const membership = await prisma.membership.findFirst({
    where: { userId: session.userId, orgId: card.orgId },
    select: { role: true },
  })
  if (!membership) throw new LocationAccessError('Karte nicht gefunden.')

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

/**
 * The tenancy gate. Resolves the location *through the membership table*, so a location
 * belonging to another organisation simply does not resolve.
 */
export async function assertLocationAccess(locationId: string): Promise<LocationAccess> {
  const session = await requireSession()

  const location = await prisma.location.findFirst({
    where: {
      id: locationId,
      org: { members: { some: { userId: session.userId } } },
    },
    select: { id: true, orgId: true },
  })

  if (!location) throw new LocationAccessError()

  return { session, locationId: location.id, orgId: location.orgId }
}
