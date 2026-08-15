import { NextResponse, type NextRequest } from 'next/server'
import { getPassBuilder } from '@/lib/pass/mock-pass-builder'
import { rateLimit } from '@/lib/rate-limit'
import {
  DEVICE_COOKIE,
  DEVICE_COOKIE_MAX_AGE,
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
 * dismisses leaves nothing behind. A tap they follow through gets one row, and every later
 * tap from the same phone gets that same row back.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  const { code } = await params
  const platform = request.nextUrl.searchParams.get('p')

  const resolved = await resolveHandoutCode(code)
  if (!resolved) {
    return NextResponse.json(
      { error: 'Dieser Code gehört zu keiner aktiven Stempelkarte.' },
      { status: 404 },
    )
  }

  // A phone without the cookie is a first-time visitor; it gets a key for this response so
  // the very next tap already recognises it.
  const existingKey = request.cookies.get(DEVICE_COOKIE)?.value
  const deviceKey = existingKey ?? newDeviceKey()

  // The chip sits in public. Without a ceiling, one person with a spare afternoon could
  // mint thousands of passes and drown the shop's numbers.
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!rateLimit(`handout:${resolved.cardId}:${ip}`, 20, 60 * 60 * 1000).allowed) {
    return NextResponse.json(
      { error: 'Zu viele Karten von diesem Anschluss. Bitte später erneut versuchen.' },
      { status: 429 },
    )
  }

  const { serial, currentStamps } = await issuePassForDevice(resolved, deviceKey)
  const design = await toHandoutDesign(resolved, currentStamps, serial)
  const builder = getPassBuilder()

  const response =
    platform === 'google'
      ? NextResponse.redirect(await builder.buildGoogleSaveUrl(design, serial), 302)
      : await applePassResponse(await builder.buildApplePass(design, serial), resolved.design.programName)

  if (!existingKey) {
    response.cookies.set(DEVICE_COOKIE, deviceKey, {
      maxAge: DEVICE_COOKIE_MAX_AGE,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    })
  }

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
