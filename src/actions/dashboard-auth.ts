'use server'

import { z } from 'zod'
import { prisma } from '@/lib/db'
import { verifyPassword } from '@/lib/auth/password'
import { isOperatorEmail } from '@/lib/auth/operators'
import {
  createDashboardSession,
  destroyDashboardSession,
  pruneExpiredSessions,
} from '@/lib/auth/dashboard-session'
import { fail, guarded, ok, type ActionResult } from '@/lib/action-result'
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
