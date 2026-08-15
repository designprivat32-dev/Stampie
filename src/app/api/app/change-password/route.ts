import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireAppUser } from '@/lib/auth/app-session'
import { hashPassword } from '@/lib/auth/password'

export const runtime = 'nodejs'

/** Set a new password (clears the forced-change flag after the first login). */
const bodySchema = z.object({
  newPassword: z.string().min(8, 'Das Passwort muss mindestens 8 Zeichen haben.').max(200),
})

export async function POST(request: Request): Promise<Response> {
  const appUser = await requireAppUser(request)
  if (!appUser) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 })

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Ungültiges Passwort.' },
      { status: 400 },
    )
  }

  const passwordHash = await hashPassword(parsed.data.newPassword)
  await prisma.user.update({
    where: { id: appUser.userId },
    data: { passwordHash, mustChangePassword: false },
  })

  return NextResponse.json({ ok: true })
}
