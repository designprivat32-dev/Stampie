'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import QRCode from 'qrcode'
import { assertCardAccess } from '@/lib/auth/session'
import { fail, guarded, ok, type ActionResult } from '@/lib/action-result'
import { prisma } from '@/lib/db'
import { appUrl } from '@/lib/app-url'
import { newNfcCode } from '@/lib/cards/handout-service'
import { loadPublishedDesign } from '@/lib/cards/repository'

/**
 * The public hand-out link: what goes onto the NFC chips and the counter QR.
 *
 * One link per card, stable for as long as it exists — it is written onto stickers that
 * nobody can recall. Turning the hand-out off clears the code, and turning it back on
 * mints a new one; the dialog warns about that, because every chip already out there stops
 * working at that moment.
 */

export interface HandoutLink {
  url: string
  qrDataUrl: string
  /** Passes handed out through this link so far, test cards excluded. */
  issuedCount: number
}

export interface HandoutState {
  link: HandoutLink | null
  /** A draft has nothing to hand out — the link stays disabled until the card is published. */
  isPublished: boolean
}

async function buildLink(cardId: string, code: string): Promise<HandoutLink> {
  const url = `${appUrl()}/k/${code}`
  const [qrDataUrl, issuedCount] = await Promise.all([
    QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1, width: 512 }),
    prisma.issuedPass.count({ where: { cardId, isTest: false, deviceKey: { not: null } } }),
  ])
  return { url, qrDataUrl, issuedCount }
}

export async function getHandoutStateAction(cardId: string): Promise<ActionResult<HandoutState>> {
  return guarded(async () => {
    const parsed = z.string().cuid().safeParse(cardId)
    if (!parsed.success) return fail('Ungültige Karten-ID.', 'validation')

    await assertCardAccess(parsed.data)

    const [card, published] = await Promise.all([
      prisma.card.findFirst({ where: { id: parsed.data }, select: { nfcCode: true } }),
      loadPublishedDesign(parsed.data),
    ])
    if (!card) return fail('Karte nicht gefunden.', 'not_found')

    return ok({
      link: card.nfcCode ? await buildLink(parsed.data, card.nfcCode) : null,
      isPublished: published !== null,
    })
  })
}

export async function enableHandoutAction(cardId: string): Promise<ActionResult<HandoutLink>> {
  return guarded(async () => {
    const parsed = z.string().cuid().safeParse(cardId)
    if (!parsed.success) return fail('Ungültige Karten-ID.', 'validation')

    await assertCardAccess(parsed.data)

    // Without a published design the link would resolve to nothing. Saying so here beats a
    // customer tapping a chip and getting an error page.
    if (!(await loadPublishedDesign(parsed.data))) {
      return fail(
        'Diese Karte ist noch nicht veröffentlicht. Erst veröffentlichen, dann ausgeben.',
        'validation',
      )
    }

    const card = await prisma.card.findFirst({
      where: { id: parsed.data },
      select: { nfcCode: true },
    })
    if (!card) return fail('Karte nicht gefunden.', 'not_found')

    const code = card.nfcCode ?? newNfcCode()
    if (!card.nfcCode) {
      await prisma.card.update({ where: { id: parsed.data }, data: { nfcCode: code } })
    }

    revalidatePath('/dashboard/karten')
    return ok(await buildLink(parsed.data, code))
  })
}

export async function disableHandoutAction(cardId: string): Promise<ActionResult<null>> {
  return guarded(async () => {
    const parsed = z.string().cuid().safeParse(cardId)
    if (!parsed.success) return fail('Ungültige Karten-ID.', 'validation')

    await assertCardAccess(parsed.data)
    await prisma.card.update({ where: { id: parsed.data }, data: { nfcCode: null } })

    revalidatePath('/dashboard/karten')
    return ok(null)
  })
}
