import type { NextRequest } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'
import {
  buildIssuedBusinessPass,
  issueHolderPass,
  recordBusinessCardEvent,
  resolveScanCode,
} from '@/lib/business-cards/scan-service'
import {
  clientIp,
  notFoundResponse,
  pkpassResponse,
  rateLimitedResponse,
} from '@/lib/business-cards/responses'

export const runtime = 'nodejs'

/**
 * Gibt dem Gegenüber die Visitenkarte als eigenen Pass in Apple Wallet.
 *
 * Der Pass entsteht erst hier, beim Tippen auf den Knopf — wer die Seite nur öffnet und
 * wieder schließt, hinterlässt nichts.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  const { code } = await params
  const resolved = await resolveScanCode(code)
  if (!resolved) return notFoundResponse()

  // Großzügig, weil auf einer Messe viele hinter demselben WLAN stehen: eine Bremse gegen
  // ein Skript, keine Warteschlange für Menschen.
  if (!rateLimit(`bcard-pass:${resolved.contactId}:${clientIp(request.headers)}`, 60, 60 * 60 * 1000).allowed) {
    return rateLimitedResponse()
  }

  const serial = await issueHolderPass(resolved)
  const bundle = await buildIssuedBusinessPass(resolved, serial, 'HOLDER')
  await recordBusinessCardEvent(resolved.contactId, 'WALLET_ADDED', 'apple')

  return pkpassResponse(bundle, resolved.contact)
}
