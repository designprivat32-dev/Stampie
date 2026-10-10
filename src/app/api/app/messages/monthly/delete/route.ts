import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireAppUser } from '@/lib/auth/app-session'

export const runtime = 'nodejs'

/**
 * Die monatliche Nachricht wieder abschalten.
 *
 * Als eigene POST-Route statt als DELETE auf die Sammelroute — dasselbe Muster wie bei den
 * Erinnerungen (`/api/app/reminders/delete`). Der kleine API-Helfer der PWA kennt nur GET
 * und POST, und ein zweiter Weg nur für dieses eine Löschen wäre Aufwand ohne Gewinn.
 *
 * Die Zeile wird wirklich entfernt und nicht nur stillgelegt: Was bereits verschickt
 * wurde, steht als `CardMessage` in der Historie und bleibt dort stehen.
 */

const schema = z.object({ id: z.string().cuid() })

export async function POST(request: Request): Promise<Response> {
  const appUser = await requireAppUser(request)
  if (!appUser) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 })

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 })
  }

  const parsed = schema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Ungültige Eingabe.', code: 'invalid' }, { status: 400 })
  }

  /*
   * Erst prüfen, wem die Nachricht gehört, dann löschen.
   *
   * `deleteMany` mit der Bedingung in einem Schritt wäre kürzer, würde aber „nicht deins"
   * und „gibt es nicht mehr" zu derselben Antwort verschmelzen — und genau diesen
   * Unterschied braucht die Oberfläche, um zwischen „Liste neu laden" und „Fehler zeigen"
   * zu entscheiden.
   */
  const row = await prisma.cardMonthlyMessage.findFirst({
    where: { id: parsed.data.id, card: { orgId: appUser.orgId } },
    select: { id: true },
  })
  if (!row) {
    return NextResponse.json({ error: 'Nicht gefunden.', code: 'not_found' }, { status: 404 })
  }

  await prisma.cardMonthlyMessage.delete({ where: { id: row.id } })

  return NextResponse.json({ ok: true })
}
