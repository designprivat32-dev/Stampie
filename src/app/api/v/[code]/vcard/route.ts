import type { NextRequest } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'
import { detectPlatform } from '@/lib/cards/test-card-service'
import { recordBusinessCardEvent, resolveScanCode } from '@/lib/business-cards/scan-service'
import { buildVCard } from '@/lib/business-cards/vcard'
import { loadContactPhoto } from '@/lib/business-cards/photo-service'
import {
  clientIp,
  notFoundResponse,
  rateLimitedResponse,
  vCardResponse,
} from '@/lib/business-cards/responses'

export const runtime = 'nodejs'

/** „Kontakt speichern": die Visitenkarte als .vcf fürs Adressbuch. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  const { code } = await params
  const resolved = await resolveScanCode(code)
  if (!resolved) return notFoundResponse()

  if (!rateLimit(`bcard-vcf:${resolved.contactId}:${clientIp(request.headers)}`, 120, 60 * 60 * 1000).allowed) {
    return rateLimitedResponse()
  }

  const platform = detectPlatform(request.headers.get('user-agent'))
  await recordBusinessCardEvent(resolved.contactId, 'CONTACT_SAVED', platform)

  const photo = await loadContactPhoto(resolved.cardId, resolved.photoAssetId)
  const photoPng = photo?.['3x'] ?? photo?.['2x'] ?? photo?.['1x'] ?? null

  return vCardResponse(
    buildVCard({ contact: resolved.contact, company: resolved.company, photoPng }),
    resolved.contact,
  )
}
