import { NextResponse, type NextRequest } from 'next/server'
import { getPassBuilder } from '@/lib/pass/mock-pass-builder'
import { rateLimit } from '@/lib/rate-limit'
import { hasConsentParam, CONSENT_PARAM } from '@/lib/privacy/consent'
import {
  issuePassForDevice,
  newDeviceKey,
  resolveHandoutCode,
  toHandoutDesign,
} from '@/lib/cards/handout-service'

export const runtime = 'nodejs'

/**
 * Hands out the customer's own pass after an NFC tap or a QR scan.
 *
 * `?p=apple` streams the .pkpass, `?p=google` redirects to the save link. No session: a
 * stranger's phone at the counter is exactly the caller this is for.
 *
 * The pass row is created here rather than on the landing page, so a tap that the customer
 * dismisses leaves nothing behind. Nothing is stored on the phone: every scan hands out a
 * fresh, empty card instead of the previous one, which is what the shop asks for when the
 * QR is scanned again.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  const { code } = await params
  const platform = request.nextUrl.searchParams.get('p')
  // Die Einwilligung reist als Parameter mit, weil der Pass erst hier entsteht: vorher
  // wird nichts gespeichert, auch kein angekreuztes Kästchen.
  const marketingConsent = hasConsentParam(request.nextUrl.searchParams.get(CONSENT_PARAM))

  const resolved = await resolveHandoutCode(code)
  if (!resolved) {
    return NextResponse.json(
      { error: 'Dieser Code gehört zu keiner aktiven Stempelkarte.' },
      { status: 404 },
    )
  }

  // Every tap mints its own card, so the key is per-pass rather than per-phone: it still
  // distinguishes real handouts from test passes, it just never identifies a returning
  // visitor.
  const deviceKey = newDeviceKey()

  // Minting is capped, and generously: every customer in a café sits behind the same WiFi
  // address, so a tight per-IP ceiling locks out real people on a busy afternoon. This is a
  // backstop against a script, not a queue.
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!rateLimit(`handout:${resolved.cardId}:${ip}`, 120, 60 * 60 * 1000).allowed) {
    return NextResponse.json(
      { error: 'Zu viele neue Karten von diesem Anschluss. Bitte später erneut versuchen.' },
      { status: 429 },
    )
  }

  const { serial, currentStamps } = await issuePassForDevice(
    resolved,
    deviceKey,
    marketingConsent,
  )
  const design = await toHandoutDesign(resolved, currentStamps, serial, marketingConsent)
  const builder = getPassBuilder()

  const response =
    platform === 'google'
      ? NextResponse.redirect(await builder.buildGoogleSaveUrl(design, serial), 302)
      : await applePassResponse(await builder.buildApplePass(design, serial), resolved.design.programName)

  return response
}

async function applePassResponse(bundle: Buffer, programName: string): Promise<NextResponse> {
  return new NextResponse(new Uint8Array(bundle), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.apple.pkpass',
      'Content-Length': String(bundle.length),
      'Content-Disposition': `attachment; filename="${slug(programName)}.pkpass"`,
      'Cache-Control': 'no-store',
    },
  })
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'stempelkarte'
  )
}
