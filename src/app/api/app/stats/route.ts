import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAppUser } from '@/lib/auth/app-session'

export const runtime = 'nodejs'

/**
 * Statistiken für den eingeloggten Betrieb.
 *
 * Ein „Kunde" = ein echtes Handy (`IssuedPass.deviceKey`). Pässe ohne Gerät zählen nicht,
 * Testkarten nicht, und nur STAMP-Pässe. Mehrfach stempeln oder eine volle Karte + neue
 * Karte machen keinen neuen Kunden: der Zähler läuft auf demselben Pass weiter, und über
 * `deviceKey` wird zusätzlich entdoppelt.
 *
 * Alles aus vorhandenen Daten — der Stempel-/Ausgabe-Code bleibt unangetastet.
 */

interface DistBucket {
  stamps: number
  count: number
}
interface CardStat {
  name: string
  stampGoal: number
  customers: number
  full: number
  redeemed: number
  distribution: DistBucket[]
}

export async function GET(request: Request): Promise<Response> {
  const appUser = await requireAppUser(request)
  if (!appUser) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 })

  // Schwelle „eingeschlafen" vorerst fest auf 2 Monate (editierbar folgt separat).
  const inactiveAfterMonths = 2

  // Karten des Betriebs + aktuelles Stempel-Ziel (veröffentlicht, sonst Entwurf, sonst 10).
  const cards = await prisma.card.findMany({
    where: { orgId: appUser.orgId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, designs: { select: { status: true, stampGoal: true } } },
  })
  const cardGoal = new Map<string, number>()
  const cardName = new Map<string, string>()
  for (const c of cards) {
    const published = c.designs.find((d) => d.status === 'PUBLISHED')
    const source = published ?? c.designs.find((d) => d.status === 'DRAFT') ?? null
    cardGoal.set(c.id, source?.stampGoal ?? 10)
    cardName.set(c.id, c.name)
  }
  const cardIds = cards.map((c) => c.id)
  if (cardIds.length === 0) {
    return NextResponse.json({
      customers: 0,
      newThisMonth: 0,
      active: 0,
      inactive: 0,
      inactiveAfterMonths,
      cards: [],
    })
  }

  // Echte Kunden-Pässe: STAMP, keine Testkarte, mit Gerät (echtes Handy hat die Karte).
  const passes = await prisma.issuedPass.findMany({
    where: { cardId: { in: cardIds }, isTest: false, kind: 'STAMP', deviceKey: { not: null } },
    select: { id: true, cardId: true, deviceKey: true, stamps: true, rewardCount: true, createdAt: true },
  })

  // Letzter echter Besuch je Pass = jüngstes STAMP-Event; fehlt eins, gilt die Ausgabe.
  const lastEvents = passes.length
    ? await prisma.stampEvent.groupBy({
        by: ['passId'],
        where: { passId: { in: passes.map((p) => p.id) }, kind: 'STAMP' },
        _max: { createdAt: true },
      })
    : []
  const lastVisitByPass = new Map<string, Date>()
  for (const e of lastEvents) if (e._max.createdAt) lastVisitByPass.set(e.passId, e._max.createdAt)

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const cutoff = new Date(now)
  cutoff.setMonth(cutoff.getMonth() - inactiveAfterMonths)

  // Pro Gerät (= Person): erster Kontakt + letzter Besuch über alle seine Pässe.
  interface Dev {
    first: Date
    last: Date
  }
  const devices = new Map<string, Dev>()
  for (const p of passes) {
    const dk = p.deviceKey as string
    const visit = lastVisitByPass.get(p.id) ?? p.createdAt
    const d = devices.get(dk)
    if (!d) {
      devices.set(dk, { first: p.createdAt, last: visit })
    } else {
      if (p.createdAt < d.first) d.first = p.createdAt
      if (visit > d.last) d.last = visit
    }
  }

  let active = 0
  let inactive = 0
  let newThisMonth = 0
  for (const d of devices.values()) {
    if (d.last < cutoff) inactive++
    else active++
    if (d.first >= startOfMonth) newThisMonth++
  }

  // Pro Karte: Kunden, „voll", eingelöst, Stempel-Verteilung (nach Gerät entdoppelt).
  const cardStats: CardStat[] = []
  for (const cid of cardIds) {
    const goal = cardGoal.get(cid) ?? 10
    const cardPasses = passes.filter((p) => p.cardId === cid)

    // Aktueller Pass je Gerät auf dieser Karte = der neueste.
    const currentByDevice = new Map<string, { stamps: number; createdAt: Date }>()
    let redeemed = 0
    for (const p of cardPasses) {
      redeemed += p.rewardCount
      const dk = p.deviceKey as string
      const cur = currentByDevice.get(dk)
      if (!cur || p.createdAt > cur.createdAt) currentByDevice.set(dk, { stamps: p.stamps, createdAt: p.createdAt })
    }

    let full = 0
    const counts = new Array<number>(goal + 1).fill(0) // Index = Stempelzahl 0..goal
    for (const cur of currentByDevice.values()) {
      if (cur.stamps >= goal) full++
      const s = Math.min(cur.stamps, goal)
      if (s >= 1 && s <= goal) counts[s]++
    }
    const distribution: DistBucket[] = []
    for (let s = 1; s <= goal; s++) distribution.push({ stamps: s, count: counts[s] })

    cardStats.push({
      name: cardName.get(cid) ?? 'Karte',
      stampGoal: goal,
      customers: currentByDevice.size,
      full,
      redeemed,
      distribution,
    })
  }

  return NextResponse.json({
    customers: devices.size,
    newThisMonth,
    active,
    inactive,
    inactiveAfterMonths,
    cards: cardStats,
  })
}
