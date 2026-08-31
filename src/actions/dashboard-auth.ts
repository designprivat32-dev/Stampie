'use server'

import { z } from 'zod'
import { prisma } from '@/lib/db'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import { isOperatorEmail } from '@/lib/auth/operators'
import {
  createDashboardSession,
  destroyDashboardSession,
  dropDashboardSessions,
  pruneExpiredSessions,
} from '@/lib/auth/dashboard-session'
import { fail, fromZodError, guarded, ok, type ActionResult } from '@/lib/action-result'
import { requireSession } from '@/lib/auth/session'
import { rateLimit } from '@/lib/rate-limit'

/**
 * Operator dashboard sign-in.
 *
 * Deliberately does not redirect: `redirect()` works by throwing, and `guarded` would swallow
 * that as an internal error. The form navigates once it sees a success envelope.
 */

const loginSchema = z.object({
  email: z.string().min(1, 'E-Mail erforderlich.').max(200),
  password: z.string().min(1, 'Passwort erforderlich.').max(200),
})

/** Same text for every rejection — never reveal which half was wrong, or who is an operator. */
const REJECTED = 'E-Mail oder Passwort falsch.'

export async function dashboardLoginAction(input: unknown): Promise<ActionResult<null>> {
  return guarded(async () => {
    const parsed = loginSchema.safeParse(input)
    if (!parsed.success) return fail(REJECTED, 'validation')

    const email = parsed.data.email.trim().toLowerCase()

    // Per address, and once more across all addresses, so guessing the operator's e-mail
    // is not a cheaper attack than guessing the password.
    if (
      !rateLimit(`dash-login:${email}`, 10, 15 * 60 * 1000).allowed ||
      !rateLimit('dash-login:all', 100, 15 * 60 * 1000).allowed
    ) {
      return fail('Zu viele Anmeldeversuche. Bitte später erneut.', 'rate_limited')
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, passwordHash: true },
    })

    // The password is verified before the allowlist is consulted, and both failures return
    // REJECTED: otherwise the response would tell an attacker whether an address is an
    // operator account.
    const passwordOk = user ? await verifyPassword(parsed.data.password, user.passwordHash) : false
    if (!user || !passwordOk || !isOperatorEmail(user.email)) return fail(REJECTED, 'forbidden')

    await pruneExpiredSessions(user.id)
    await createDashboardSession(user.id)
    return ok(null)
  })
}

export async function dashboardLogoutAction(): Promise<ActionResult<null>> {
  return guarded(async () => {
    await destroyDashboardSession()
    return ok(null)
  })
}

const changeSchema = z
  .object({
    currentPassword: z.string().min(1, 'Aktuelles Passwort erforderlich.').max(200),
    newPassword: z
      .string()
      .min(8, 'Das neue Passwort muss mindestens 8 Zeichen haben.')
      .max(200),
    repeatPassword: z.string().max(200),
  })
  .refine((v) => v.newPassword === v.repeatPassword, {
    path: ['repeatPassword'],
    message: 'Die Passwörter stimmen nicht überein.',
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ['newPassword'],
    message: 'Das neue Passwort muss sich vom alten unterscheiden.',
  })

/**
 * Changes the signed-in operator's password.
 *
 * The current password is required even though the caller already holds a session: a
 * session that leaked must not be enough to take the account over.
 *
 * Every other dashboard session of this user is dropped and a fresh one issued — changing
 * a password is how you get rid of someone who should no longer be signed in, and that only
 * works if the old cookies stop working. The native app's bearer tokens are left alone;
 * they are a different credential with a different password prompt.
 */
export async function changeDashboardPasswordAction(input: unknown): Promise<ActionResult<null>> {
  return guarded(async () => {
    const session = await requireSession()

    const parsed = changeSchema.safeParse(input)
    if (!parsed.success) return fromZodError(parsed.error)

    if (!rateLimit(`dash-pw:${session.userId}`, 10, 15 * 60 * 1000).allowed) {
      return fail('Zu viele Versuche. Bitte später erneut.', 'rate_limited')
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { passwordHash: true },
    })
    if (!user || !(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
      return fail('Aktuelles Passwort falsch.', 'forbidden', {
        currentPassword: 'Aktuelles Passwort falsch.',
      })
    }

    await prisma.user.update({
      where: { id: session.userId },
      data: {
        passwordHash: await hashPassword(parsed.data.newPassword),
        mustChangePassword: false,
      },
    })

    await dropDashboardSessions(session.userId)
    await createDashboardSession(session.userId)
    return ok(null)
  })
}
