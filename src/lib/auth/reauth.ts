import 'server-only'
import { prisma } from '@/lib/db'
import { verifyPassword } from '@/lib/auth/password'
import { PasswordConfirmationError, requireSession } from '@/lib/auth/session'
import { rateLimit } from '@/lib/rate-limit'

/**
 * Re-entering the password before something irreversible happens.
 *
 * A session is a convenience — it stays valid for a week and travels in a cookie. That is
 * the right trade for looking at cards; it is the wrong trade for deleting them. Both
 * actions behind this gate destroy something no backup brings back: a deleted card takes
 * every customer's pass and stamp history with it, and switching a hand-out off burns the
 * code that is printed on the stands.
 *
 * So these two ask again. An unattended laptop, a borrowed browser or a stolen cookie is
 * then not enough — the password has to be known.
 */

/** Same window as the login, per operator and per kind of action. */
const ATTEMPTS = 10
const WINDOW_MS = 15 * 60 * 1000

/**
 * Throws `PasswordConfirmationError` unless `password` is the signed-in operator's.
 *
 * `scope` only separates the rate-limit buckets, so a fumbled delete confirmation cannot
 * lock the operator out of the other action.
 */
export async function assertPassword(password: unknown, scope: string): Promise<void> {
  const session = await requireSession()

  if (typeof password !== 'string' || password.length === 0 || password.length > 200) {
    throw new PasswordConfirmationError('Bitte das Passwort eingeben.')
  }

  if (!rateLimit(`reauth:${scope}:${session.userId}`, ATTEMPTS, WINDOW_MS).allowed) {
    throw new PasswordConfirmationError('Zu viele Versuche. Bitte später erneut.')
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { passwordHash: true },
  })

  // No stored password means the local development session (`DEV_SESSION_USER_EMAIL`),
  // which has none by definition. In production that session does not exist and an
  // operator without a hash could not have signed in, so this is not a way past the gate.
  if (!user?.passwordHash) {
    if (process.env.NODE_ENV !== 'production') return
    throw new PasswordConfirmationError('Für dieses Konto ist kein Passwort hinterlegt.')
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new PasswordConfirmationError('Passwort falsch.')
  }
}
