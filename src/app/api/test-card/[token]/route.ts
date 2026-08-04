import { NextResponse, type NextRequest } from 'next/server'
import { getPassBuilder } from '@/lib/pass/mock-pass-builder'
import {
  ensureIssuedPass,
  noteTokenUse,
  resolveTestCardToken,
  toPassDesign,
} from '@/lib/cards/test-card-service'

export const runtime = 'nodejs'

/**
 * Public download endpoint for a test card.
 *
 * `?p=apple` streams the .pkpass bundle, `?p=google` redirects to the Save-to-Wallet URL.
 * No session: the whole point is that a stranger's phone can open the QR code. The token
 * carries its own snapshot and is capped by TTL and use count.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params
  const platform = request.nextUrl.searchParams.get('p')

  const resolved = await resolveTestCardToken(token)
  if (!resolved) {
    return NextResponse.json(
      { error: 'Dieser Link ist abgelaufen. Bitte im Dashboard eine neue Testkarte erzeugen.' },
      { status: 404 },
    )
  }

  // Register the pass before handing it out, so the serial in its barcode is scannable.
  await ensureIssuedPass(resolved)

  const design = await toPassDesign(resolved)
  const builder = getPassBuilder()

  if (platform === 'google') {
    const url = await builder.buildGoogleSaveUrl(design, resolved.serial)
    await noteTokenUse(token)
    return NextResponse.redirect(url, 302)
  }

  const bundle = await builder.buildApplePass(design, resolved.serial)
  await noteTokenUse(token)

  const filename = `${slug(resolved.design.programName || 'stempelkarte')}.pkpass`

  return new NextResponse(new Uint8Array(bundle), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.apple.pkpass',
      'Content-Length': String(bundle.length),
      'Content-Disposition': `attachment; filename="${filename}"`,
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
