import { NextResponse, type NextRequest } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'
import {
  googleSaveUrlFor,
  issueHolderPass,
  recordBusinessCardEvent,
  resolveScanCode,
} from '@/lib/business-cards/scan-service'
import { clientIp, notFoundResponse, rateLimitedResponse } from '@/lib/business-cards/responses'

export const runtime = 'nodejs'

/** Wie `/apple`, nur leitet es auf Googles Speichern-Seite weiter statt ein .pkpass zu liefern. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  const { code } = await params
  const resolved = await resolveScanCode(code)
  if (!resolved) return notFoundResponse()

  if (!rateLimit(`bcard-pass:${resolved.contactId}:${clientIp(request.headers)}`, 60, 60 * 60 * 1000).allowed) {
    return rateLimitedResponse()
  }

  const serial = await issueHolderPass(resolved)
  await recordBusinessCardEvent(resolved.contactId, 'WALLET_ADDED', 'google')

  return NextResponse.redirect(googleSaveUrlFor(resolved, serial, 'HOLDER'), 302)
}
