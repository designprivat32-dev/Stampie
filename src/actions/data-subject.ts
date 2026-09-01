'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { assertCardAccess } from '@/lib/auth/session'
import { assertPassword } from '@/lib/auth/reauth'
import { fail, guarded, ok, type ActionResult } from '@/lib/action-result'

/**
 * Auskunft und Löschung für einzelne Karten.
 *
 * Fragt ein Kunde beim Betrieb nach seinen Daten oder nach Löschung, muss der Betrieb
 * antworten können — ohne dass jemand mit einem Datenbank-Zugang von Hand in der
 * Produktion sucht. Genau das war der Zustand vorher.
 *
 * Einstieg ist die Kartennummer, weil sie das Einzige ist, was Karte und Mensch verbindet:
 * gespeichert wird kein Name, keine E-Mail, keine Telefonnummer. Wer seine Nummer nicht
 * mehr hat, kann seine Karte auch nicht nachweisen — das ist die Kehrseite davon, dass so
 * wenig erhoben wird, und es ist die richtige Seite, auf der man dabei steht.
 */

const serialSchema = z
  .string()
  .trim()
  .min(3, 'Bitte die Kartennummer eingeben.')
  .max(40)
  .transform((v) => v.toUpperCase())

export interface StampEntry {
  kind: string
  delta: number
  balance: number
  at: string
}

export interface PassRecord {
  serial: string
  cardName: string
  organizationName: string | null
  kind: string
  isTest: boolean
  stamps: number
  stampGoal: number
  rewardCount: number
  issuedAt: string
  updatedAt: string
  lastRewardAt: string | null
  redeemedAt: string | null
  hasActiveMessage: boolean
  appleDevices: number
  reminderDeliveries: number
  events: StampEntry[]
}

export async function lookupPassAction(serial: string): Promise<ActionResult<PassRecord>> {
  return guarded(async () => {
    const parsed = serialSchema.safeParse(serial)
    if (!parsed.success) return fail('Bitte die Kartennummer eingeben.', 'validation')

    const pass = await prisma.issuedPass.findFirst({
      where: { serial: parsed.data },
      select: {
        id: true, serial: true, kind: true, isTest: true, stamps: true, stampGoal: true,
        rewardCount: true, createdAt: true, updatedAt: true, lastRewardAt: true,
        redeemedAt: true, activeMessage: true, cardId: true,
        card: { select: { name: true, org: { select: { name: true } } } },
      },
    })
    if (!pass) return fail('Zu dieser Kartennummer gibt es keine Karte.', 'not_found')

    // Mandantenprüfung: eine geratene Nummer darf keine fremde Karte offenlegen.
    await assertCardAccess(pass.cardId)

    const [events, appleDevices, reminderDeliveries] = await Promise.all([
      prisma.stampEvent.findMany({
        where: { passId: pass.id },
        orderBy: { createdAt: 'desc' },
        select: { kind: true, delta: true, balance: true, createdAt: true },
      }),
      prisma.appleDeviceRegistration.count({ where: { passId: pass.id } }),
      prisma.cardReminderDelivery.count({ where: { passId: pass.id } }),
    ])

    return ok({
      serial: pass.serial,
      cardName: pass.card.name,
      organizationName: pass.card.org?.name ?? null,
      kind: pass.kind,
      isTest: pass.isTest,
      stamps: pass.stamps,
      stampGoal: pass.stampGoal,
      rewardCount: pass.rewardCount,
      issuedAt: pass.createdAt.toISOString(),
      updatedAt: pass.updatedAt.toISOString(),
      lastRewardAt: pass.lastRewardAt?.toISOString() ?? null,
      redeemedAt: pass.redeemedAt?.toISOString() ?? null,
      hasActiveMessage: pass.activeMessage !== null,
      appleDevices,
      reminderDeliveries,
      events: events.map((e) => ({
        kind: e.kind,
        delta: e.delta,
        balance: e.balance,
        at: e.createdAt.toISOString(),
      })),
    })
  })
}

/**
 * Löscht alles zu dieser Karte.
 *
 * Die Fremdschlüssel räumen mit ab: Stempel-Historie, Apple-Geräteregistrierungen und
 * Erinnerungs-Nachweise hängen mit `onDelete: Cascade` an der Karte. Danach ist der Pass
 * im Wallet des Kunden endgültig tot — genau das ist bei einer Löschanfrage gewollt, aber
 * es ist unumkehrbar, deshalb das Passwort.
 */
export async function deletePassDataAction(
  serial: string,
  password: string,
): Promise<ActionResult<null>> {
  return guarded(async () => {
    const parsed = serialSchema.safeParse(serial)
    if (!parsed.success) return fail('Bitte die Kartennummer eingeben.', 'validation')

    const pass = await prisma.issuedPass.findFirst({
      where: { serial: parsed.data },
      select: { id: true, cardId: true },
    })
    if (!pass) return fail('Zu dieser Kartennummer gibt es keine Karte.', 'not_found')

    await assertCardAccess(pass.cardId)
    await assertPassword(password, 'pass-delete')

    await prisma.issuedPass.delete({ where: { id: pass.id } })

    revalidatePath('/dashboard/auskunft')
    return ok(null)
  })
}
