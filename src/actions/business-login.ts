'use server'

import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { isAgency, requireSession } from '@/lib/auth/session'
import { fail, guarded, ok, type ActionResult } from '@/lib/action-result'
import { prisma } from '@/lib/db'
import { hashPassword } from '@/lib/auth/password'

/**
 * Creates an app login for a business (Organization): a username + a random start password.
 * The password is returned exactly once (to hand to the business); only its hash is stored.
 * The business must change it on first login (`mustChangePassword`).
 */

interface BusinessLogin {
  username: string
  password: string
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
  return base || 'firma'
}

/** Readable password without easily-confused characters (0/O, 1/l/I). */
function randomPassword(length = 10): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = randomBytes(length)
  let out = ''
  for (const b of bytes) out += alphabet[b % alphabet.length]
  return out
}

export async function createBusinessLoginAction(
  orgId: string,
): Promise<ActionResult<BusinessLogin>> {
  return guarded(async () => {
    const idParsed = z.string().cuid().safeParse(orgId)
    if (!idParsed.success) return fail('Ungültige Kunden-ID.', 'validation')

    const session = await requireSession()
    if (!(await isAgency(session.userId))) {
      return fail('Nur das Agentur-Team darf Logins erzeugen.', 'forbidden')
    }

    const org = await prisma.organization.findFirst({
      where: { id: idParsed.data },
      select: { id: true, name: true },
    })
    if (!org) return fail('Kunde nicht gefunden.', 'not_found')

    // Find a free username based on the company name.
    const base = slugify(org.name)
    let username = base
    for (let i = 0; i < 50; i++) {
      const taken = await prisma.user.findUnique({ where: { username }, select: { id: true } })
      if (!taken) break
      username = `${base}-${Math.floor(Math.random() * 900 + 100)}`
    }

    const password = randomPassword()
    const passwordHash = await hashPassword(password)
    // User.email is required + unique; synthesise one, the app never uses it.
    const email = `${username}@login.stampie.local`

    const user = await prisma.user.create({
      data: { email, name: org.name, username, passwordHash, mustChangePassword: true },
      select: { id: true },
    })
    await prisma.membership.upsert({
      where: { userId_orgId: { userId: user.id, orgId: org.id } },
      update: { role: 'OWNER' },
      create: { userId: user.id, orgId: org.id, role: 'OWNER' },
    })

    revalidatePath('/dashboard/kunden')
    return ok({ username, password })
  })
}
