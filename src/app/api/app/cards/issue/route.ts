import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireAppUser } from '@/lib/auth/app-session'
import { appUrl } from '@/lib/app-url'
import { newNfcCode } from '@/lib/cards/handout-service'
import { loadPublishedDesign } from '@/lib/cards/repository'

export const runtime = 'nodejs'

/**
 * Der Ausgabe-QR für einen neuen Kunden: der Link `/k/<code>` dieser Karte.
 *
 * Vorher stand hier etwas anderes — die Route legte selbst einen `IssuedPass` an und gab
 * dessen `/s/<serial>` zurück. Das sah aus wie eine Ausgabe, war aber keine: `/s/` ist die
 * Statusseite eines bestehenden Passes, ohne Wallet-Knöpfe. Der Kunde scannte, sah einen
 * Zählerstand und hatte danach immer noch nichts im Wallet, während in der Datenbank eine
 * Karte lag, die niemand besitzt.
 *
 * Der Ausgabe-Link kann dagegen genau das: er baut dem Telefon, das ihn öffnet, seinen
 * eigenen Pass und bietet Apple und Google Wallet an. Derselbe Link steckt auf den
 * NFC-Chips und dem Aufsteller an der Theke — die App zeigt ihn nur auf dem Bildschirm,
 * damit ein Betrieb ohne Chip und ohne Aufkleber auskommt.
 *
 * Der Code wird beim ersten Mal geprägt und bleibt danach stehen: er ist derselbe, der auf
 * gedruckten Aufklebern steht, und darf sich nicht bei jeder Ausgabe ändern.
 */

const bodySchema = z.object({ cardId: z.string().cuid() })

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
  if (!parsed.success) return NextResponse.json({ error: 'Keine Karte angegeben.' }, { status: 400 })

  const card = await prisma.card.findFirst({
    where: { id: parsed.data.cardId },
    select: { id: true, name: true, orgId: true, nfcCode: true },
  })

  // Gelöscht heißt gelöscht: die App hält womöglich noch eine Liste von vorhin in der Hand.
  // Sie bekommt einen eigenen Grund, damit sie die Liste nachziehen kann statt den Fehler
  // als Rechteproblem auszugeben.
  if (!card) {
    return NextResponse.json(
      { error: 'Diese Karte gibt es nicht mehr. Sie wurde gelöscht.', code: 'not_found' },
      { status: 404 },
    )
  }

  if (card.orgId !== appUser.orgId) {
    return NextResponse.json(
      { error: 'Diese Karte gehört nicht zu deinem Betrieb.', code: 'forbidden' },
      { status: 403 },
    )
  }

  // Ohne veröffentlichte Fassung landet der Kunde auf einer Fehlerseite. Das hier zu sagen
  // ist besser, als ihn das an der Theke herausfinden zu lassen.
  const design = await loadPublishedDesign(card.id)
  if (!design) {
    return NextResponse.json(
      {
        error: 'Diese Karte ist noch nicht veröffentlicht. Erst im Designer veröffentlichen.',
        code: 'not_published',
      },
      { status: 409 },
    )
  }

  const code = card.nfcCode ?? newNfcCode()
  if (!card.nfcCode) {
    await prisma.card.update({ where: { id: card.id }, data: { nfcCode: code } })
  }

  return NextResponse.json({
    cardId: card.id,
    cardName: card.name,
    url: `${appUrl()}/k/${code}`,
    stampGoal: design.stampGoal,
  })
}
