import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireAppUser } from '@/lib/auth/app-session'

export const runtime = 'nodejs'

/**
 * Die Schwelle, ab der ein Kunde in der Statistik als „eingeschlafen" gilt.
 *
 * Die App hatte den Regler schon, nur nicht den Endpunkt dahinter — sie zeigte deshalb
 * „Server-Teil folgt noch". Das ist er.
 *
 * Der Wert gehört dem Betrieb, nicht der Karte: er beschreibt, wie oft man in *dieser*
 * Branche wiederkommt. Beim Friseur sind zwei Monate knapp, beim Café wären sie lang.
 *
 * Geschrieben wird immer nur die eigene Organisation — `appUser.orgId` kommt aus dem
 * Token, nie aus dem Rumpf der Anfrage. Ein Betrieb kann damit keine fremde Einstellung
 * verändern, auch nicht mit einer geratenen Id.
 */

const bodySchema = z.object({
  inaktivNachMonaten: z
    .number()
    .int('Bitte eine ganze Zahl angeben.')
    .min(1, 'Mindestens ein Monat.')
    // Dieselbe Obergrenze wie im Eingabefeld der App: darüber ist die Zahl keine
    // Aussage mehr, sondern ein Vertipper.
    .max(60, 'Höchstens 60 Monate.'),
})

export async function POST(request: Request): Promise<Response> {
  const appUser = await requireAppUser(request)
  if (!appUser) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 })
  if (appUser.role === 'AGENCY') {
    return NextResponse.json(
      { error: 'Agentur-Konten dürfen die Einstellungen des Betriebs nicht ändern.' },
      { status: 403 },
    )
  }

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Ungültiger Wert.' },
      { status: 400 },
    )
  }

  const org = await prisma.organization.update({
    where: { id: appUser.orgId },
    data: { inaktivNachMonaten: parsed.data.inaktivNachMonaten },
    select: { inaktivNachMonaten: true },
  })

  return NextResponse.json({ ok: true, inaktivNachMonaten: org.inaktivNachMonaten })
}
