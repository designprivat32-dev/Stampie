import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireAppUser } from '@/lib/auth/app-session'
import { deliverOneReminder } from '@/lib/cards/reminder-service'

export const runtime = 'nodejs'

/**
 * Erinnerung sofort verschicken (Test aus der App).
 *
 * Authentifiziert über den Betriebs-Login — nicht über `CRON_SECRET`. So kann ein Betrieb
 * selbst prüfen, ob die Zustellung funktioniert, ohne auf den nächsten Cron-Lauf zu warten.
 * Der Zeitplan bleibt stehen (`advanceSchedule: false`), damit der Test die normale
 * Taktung nicht verschiebt.
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

  // Nur eigene Erinnerungen testen.
  const reminder = await prisma.cardReminder.findFirst({
    where: { id: parsed.data.id, card: { orgId: appUser.orgId } },
    select: { id: true },
  })
  if (!reminder) return NextResponse.json({ error: 'Erinnerung nicht gefunden.' }, { status: 404 })

  const result = await deliverOneReminder(reminder.id, new Date(), { advanceSchedule: false })

  return NextResponse.json({
    ok: true,
    delivered: result.delivered,
    appleDevices: result.appleDevices,
    appleFailed: result.appleFailed,
    googleStatus: result.googleStatus,
  })
}
