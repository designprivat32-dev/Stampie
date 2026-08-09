import { NextResponse, type NextRequest } from 'next/server'
import { getPassBuilder } from '@/lib/pass/mock-pass-builder'
import { resolveClaimToken, toCouponPassDesign } from '@/lib/cards/reward-coupon'

export const runtime = 'nodejs'

/**
 * Public download endpoint for a reward coupon.
 *
 * `?p=apple` streams the .pkpass bundle, `?p=google` redirects to the Save-to-Wallet URL.
 * No session by design — the customer's phone opens this straight from the QR shown at the
 * till. The claim token is the credential; unlike the serial it is random and never printed
 * on the pass, so seeing a coupon does not let anyone mint one.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params
  const platform = request.nextUrl.searchParams.get('p')

  const resolved = await resolveClaimToken(token)
  if (!resolved) {
    return NextResponse.json({ error: 'Dieser Gutschein-Link ist ungültig.' }, { status: 404 })
  }

  const design = await toCouponPassDesign(resolved)
  const builder = getPassBuilder()

  if (platform === 'google') {
    return NextResponse.redirect(await builder.buildGoogleSaveUrl(design, resolved.serial), 302)
  }

  const bundle = await builder.buildApplePass(design, resolved.serial)

  return new NextResponse(new Uint8Array(bundle), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.apple.pkpass',
      'Content-Length': String(bundle.length),
      'Content-Disposition': 'attachment; filename="gutschein.pkpass"',
      'Cache-Control': 'no-store',
    },
  })
}
