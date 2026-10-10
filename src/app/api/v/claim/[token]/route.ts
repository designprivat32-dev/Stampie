import type { NextRequest } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'
import {
  buildIssuedBusinessPass,
  issueOwnerPass,
  resolveOwnerClaim,
} from '@/lib/business-cards/scan-service'
import {
  clientIp,
  notFoundResponse,
  pkpassResponse,
  rateLimitedResponse,
} from '@/lib/business-cards/responses'

export const runtime = 'nodejs'

/**
 * Der Aussteller-Pass mit QR-Code, über den Link aus dem Dashboard.
 *
 * Liefert bei jedem Aufruf denselben Pass (siehe `issueOwnerPass`), damit ein zweiter Klick
 * oder ein abgebrochener Download keinen zweiten Aussteller-Pass erzeugt.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params

  // Vor der Datenbank: ein geratenes Token soll nicht beliebig oft nachfragen dürfen.
  if (!rateLimit(`bcard-claim:${clientIp(request.headers)}`, 30, 60 * 60 * 1000).allowed) {
    return rateLimitedResponse()
  }

  const resolved = await resolveOwnerClaim(token)
  if (!resolved) return notFoundResponse()

  const serial = await issueOwnerPass(resolved)
  const bundle = await buildIssuedBusinessPass(resolved, serial, 'OWNER')
  return pkpassResponse(bundle, resolved.contact)
}
