import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAppUser } from '@/lib/auth/app-session'
import { extractSerial } from '@/lib/cards/stamping'
import { loadPublishedDesign } from '@/lib/cards/repository'

export const runtime = 'nodejs'

/**
 * Der Stand einer gescannten Karte, bevor gebucht wird.
 *
 * Die Kasse fragte bisher nach dem Scan sofort „Wie viele Stempel?" — auch bei einer
 * vollen Karte, für die das die falsche Frage ist. Um stattdessen „Einlösen" anzubieten,
 * muss die App den Stand kennen, und den gab es nirgends abzuholen.
 *
 * Nur lesend. Gebucht wird weiterhin über `/api/app/stamp`, damit es genau eine Stelle
 * gibt, an der sich ein Zähler ändert.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const appUser = await requireAppUser(request)
  if (!appUser) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 })

  const serial = extractSerial(request.nextUrl.searchParams.get('serial') ?? '')
  if (!serial) {
    return NextResponse.json(
      { error: 'Dieser Code enthält keine gültige Kartennummer.', code: 'invalid' },
      { status: 422 },
    )
  }

  const pass = await prisma.issuedPass.findFirst({
    where: { serial },
    select: {
      serial: true,
      stamps: true,
      kind: true,
      cardId: true,
      card: { select: { name: true, orgId: true } },
    },
  })
  if (!pass) {
    return NextResponse.json(
      { error: 'Diese Karte gibt es nicht mehr.', code: 'not_found' },
      { status: 404 },
    )
  }
  if (pass.card.orgId !== appUser.orgId) {
    return NextResponse.json(
      { error: 'Diese Karte gehört nicht zu deinem Betrieb.', code: 'forbidden' },
      { status: 403 },
    )
  }

  // Dasselbe Ziel, gegen das auch gebucht wird: das aktuelle Design.
  const design = await loadPublishedDesign(pass.cardId)
  const stampGoal = design?.stampGoal ?? 10

  return NextResponse.json({
    serial: pass.serial,
    cardName: pass.card.name,
    kind: pass.kind,
    stamps: pass.stamps,
    stampGoal,
    /** Ab hier bietet die Kasse „Einlösen" statt „Stempeln" an. */
    full: pass.stamps >= stampGoal,
  })
}
