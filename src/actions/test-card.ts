'use server'

import { randomBytes } from 'node:crypto'
import QRCode from 'qrcode'
import { assertCardAccess } from '@/lib/auth/session'
import { fail, fromZodError, guarded, ok, type ActionResult } from '@/lib/action-result'
import { prisma } from '@/lib/db'
import { createTestCardInputSchema, sendTestCardEmailInputSchema } from '@/lib/cards/schema'
import { renderStripImageSet } from '@/lib/cards/render-strip'
import { loadStripAssets } from '@/lib/cards/asset-service'
import { getMailer, testCardMail } from '@/lib/mail'
import { rateLimit } from '@/lib/rate-limit'
import { appUrl } from '@/lib/app-url'
import { syncGoogleClass } from '@/lib/wallet/google-sync'
import { issuerName } from '@/lib/cards/card-service'
import { passSigningStatus, type PassSigningStatus } from '@/lib/pass/pass-builder'
import type { Prisma } from '@prisma/client'

/**
 * Test card flow — the single most important function on this page.
 *
 * Budget from click to card-in-wallet is 20 seconds, so the expensive part (rendering the
 * strip at three resolutions) happens here, while the modal is opening, not when the
 * phone hits the link. By the time the QR code is scanned there is nothing left to do but
 * zip the bundle.
 *
 * The token is deliberately unauthenticated — a stranger's phone has to be able to open
 * it. It is 256 bits of randomness, lives 30 minutes, is capped at 20 uses, and carries a
 * *snapshot* of the design, so possessing it grants no read access to anything else.
 */

const TOKEN_TTL_MS = 30 * 60 * 1000

export interface TestCardPayload {
  token: string
  url: string
  /** data:image/png;base64,... — rendered server-side, no client QR library. */
  qrDataUrl: string
  expiresAt: string
  /** Which wallets will actually accept this pass — see passSigningStatus(). */
  signing: PassSigningStatus
}

export async function createTestCardAction(input: unknown): Promise<ActionResult<TestCardPayload>> {
  return guarded(async () => {
    const parsed = createTestCardInputSchema.safeParse(input)
    if (!parsed.success) return fromZodError(parsed.error)

    const { cardId, design, simulatedStamps } = parsed.data
    await assertCardAccess(cardId)

    const limit = rateLimit(`testcard:${cardId}`, 60, 60 * 60 * 1000)
    if (!limit.allowed) {
      return fail('Zu viele Testkarten. Bitte in einer Stunde erneut versuchen.', 'rate_limited')
    }

    const stamps = Math.min(simulatedStamps, design.stampGoal)

    // Warm the render up front so the scan path stays trivial.
    const assets = await loadStripAssets(design, cardId)
    await renderStripImageSet(design, stamps, {
      customIconPng: assets.customIconPng,
      backgroundPng: assets.backgroundPng,
    })

    // Push the current design onto the Google class now, not on the scan path: an
    // inlined class is only created once, so without this the demo would show whatever
    // design existed the very first time a card was saved.
    await syncGoogleClass(cardId, design, await issuerName(cardId))

    const draft = await prisma.cardDesign.findFirst({
      where: { cardId, status: 'DRAFT' },
      select: { id: true },
    })

    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS)

    await prisma.testCardToken.create({
      data: {
        token,
        cardId,
        designId: draft?.id ?? '',
        snapshot: { design, currentStamps: stamps } as unknown as Prisma.InputJsonValue,
        expiresAt,
      },
    })

    const base = appUrl()
    const url = `${base}/p/${token}`

    const qrDataUrl = await QRCode.toDataURL(url, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 512,
      color: { dark: '#18181bff', light: '#ffffffff' },
    })

    return ok({ token, url, qrDataUrl, expiresAt: expiresAt.toISOString(), signing: passSigningStatus() })
  })
}

export async function sendTestCardEmailAction(input: unknown): Promise<ActionResult<null>> {
  return guarded(async () => {
    const parsed = sendTestCardEmailInputSchema.safeParse(input)
    if (!parsed.success) return fromZodError(parsed.error)

    const { cardId, token, email } = parsed.data
    await assertCardAccess(cardId)

    // Free-form recipients would make this an open relay; 5 per hour per location keeps
    // it useful for a sales visit and useless for spam.
    const limit = rateLimit(`testcard-mail:${cardId}`, 5, 60 * 60 * 1000)
    if (!limit.allowed) {
      return fail(
        'Es wurden bereits 5 Testkarten in dieser Stunde verschickt. Bitte später erneut versuchen.',
        'rate_limited',
      )
    }

    const record = await prisma.testCardToken.findFirst({
      where: { token, cardId, expiresAt: { gt: new Date() } },
      select: { snapshot: true },
    })
    if (!record) return fail('Dieser Link ist abgelaufen. Bitte neue Testkarte erzeugen.', 'not_found')

    const snapshot = record.snapshot as { design?: { programName?: string } } | null
    const base = appUrl()
    const url = `${base}/p/${token}`

    const mail = testCardMail(url, snapshot?.design?.programName ?? '')
    await getMailer().send({ to: email, ...mail })

    return ok(null)
  })
}

export async function cleanupExpiredTokensAction(): Promise<ActionResult<number>> {
  return guarded(async () => {
    const result = await prisma.testCardToken.deleteMany({ where: { expiresAt: { lt: new Date() } } })
    return ok(result.count)
  })
}
