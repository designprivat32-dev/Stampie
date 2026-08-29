import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireAppUser } from '@/lib/auth/app-session'

export const runtime = 'nodejs'

/**
 * Erinnerung löschen. Als POST (nicht DELETE), weil das App-API per CORS nur GET/POST
 * erlaubt und die Web-App cross-origin läuft.
 */

const bodySchema = z.object({ id: z.string().cuid() })

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
  if (!parsed.success) return NextResponse.json({ error: 'Ungültige ID.' }, { status: 400 })

  // Nur löschen, wenn die Erinnerung zu einer Karte dieses Betriebs gehört.
  const reminder = await prisma.cardReminder.findFirst({
    where: { id: parsed.data.id, card: { orgId: appUser.orgId } },
    select: { id: true },
  })
  if (!reminder) return NextResponse.json({ error: 'Erinnerung nicht gefunden.' }, { status: 404 })

  await prisma.cardReminder.delete({ where: { id: reminder.id } })
  return NextResponse.json({ ok: true })
}
