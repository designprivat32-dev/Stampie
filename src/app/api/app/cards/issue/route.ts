import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireAppUser } from '@/lib/auth/app-session'
import { appUrl } from '@/lib/app-url'

export const runtime = 'nodejs'

/**
 * Issues a fresh customer pass for one of the business's cards and returns its serial + a
 * link. The business shows the resulting QR to a new customer; the same serial is what the
 * scanner books stamps against.
 */

const bodySchema = z.object({ cardId: z.string().cuid() })

/** Uppercase, unambiguous serial (no 0/O/1/I). extractSerial accepts [A-Z0-9]{4,64}. */
function randomSerial(length = 10): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(length)
  let out = ''
  for (const b of bytes) out += alphabet[b % alphabet.length]
  return out
}

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
    select: {
      id: true,
      orgId: true,
      designs: { select: { status: true, version: true, stampGoal: true } },
    },
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

  const published = card.designs.find((d) => d.status === 'PUBLISHED')
  const source = published ?? card.designs.find((d) => d.status === 'DRAFT') ?? null
  const stampGoal = source?.stampGoal ?? 10
  const designVersion = source?.version ?? 1

  // Find a free serial.
  let serial = randomSerial()
  for (let i = 0; i < 10; i++) {
    const taken = await prisma.issuedPass.findUnique({ where: { serial }, select: { id: true } })
    if (!taken) break
    serial = randomSerial()
  }

  await prisma.issuedPass.create({
    data: { serial, cardId: card.id, isTest: false, stamps: 0, designVersion, stampGoal },
  })

  return NextResponse.json({ serial, url: `${appUrl()}/s/${serial}`, stampGoal })
}
