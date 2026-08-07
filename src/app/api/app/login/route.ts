import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { verifyPassword } from '@/lib/auth/password'
import { createAppSession } from '@/lib/auth/app-session'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'

/**
 * Business-app login. Username + password → bearer token. No public registration: accounts
 * are created by the agency in the Stampie admin.
 */

const bodySchema = z.object({
  username: z.string().min(1).max(60),
  password: z.string().min(1).max(200),
})

export async function POST(request: Request): Promise<Response> {
  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Benutzername und Passwort erforderlich.' }, { status: 400 })
  }

  const username = parsed.data.username.trim().toLowerCase()

  if (!rateLimit(`app-login:${username}`, 10, 15 * 60 * 1000).allowed) {
    return NextResponse.json(
      { error: 'Zu viele Anmeldeversuche. Bitte später erneut.' },
      { status: 429 },
    )
  }

  const user = await prisma.user.findUnique({ where: { username } })
  const passwordOk = user ? await verifyPassword(parsed.data.password, user.passwordHash) : false

  if (!user || !passwordOk) {
    // Same message either way — do not reveal whether the username exists.
    return NextResponse.json({ error: 'Benutzername oder Passwort falsch.' }, { status: 401 })
  }

  const token = await createAppSession(user.id)
  return NextResponse.json({ token, mustChangePassword: user.mustChangePassword })
}
