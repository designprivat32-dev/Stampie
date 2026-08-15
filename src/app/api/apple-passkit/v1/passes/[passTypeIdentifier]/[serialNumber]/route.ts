import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyApplePassAuth } from '@/lib/pass/apple-passkit-auth'
import { rebuildIssuedPass } from '@/lib/cards/pass-rebuild'

export const runtime = 'nodejs'

/**
 * "Give me the latest version of this pass." The endpoint the whole push mechanism exists
 * to reach: Wallet arrives here after a push, gets a freshly built bundle with the current
 * stamp row rendered into it, and replaces what the customer holds.
 *
 * `If-Modified-Since` is honoured because Wallet sends it and a 304 saves rebuilding a
 * bundle — sharp images at three resolutions — for a pass that has not moved.
 */

interface RouteContext {
  params: Promise<{ passTypeIdentifier: string; serialNumber: string }>
}

export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  const { passTypeIdentifier, serialNumber } = await context.params

  const authorized = await verifyApplePassAuth(
    passTypeIdentifier,
    serialNumber,
    request.headers.get('authorization'),
  )
  if (!authorized) return new NextResponse(null, { status: 401 })

  const pass = await prisma.issuedPass.findFirst({
    where: { id: authorized.id },
    select: { updatedAt: true },
  })
  if (!pass) return new NextResponse(null, { status: 404 })

  const ifModifiedSince = request.headers.get('if-modified-since')
  if (ifModifiedSince) {
    const since = new Date(ifModifiedSince)
    // Compared at second resolution: HTTP dates carry no milliseconds, so a pass written
    // 200ms after the header's timestamp would otherwise look perpetually newer.
    if (
      !Number.isNaN(since.getTime()) &&
      Math.floor(pass.updatedAt.getTime() / 1000) <= Math.floor(since.getTime() / 1000)
    ) {
      return new NextResponse(null, { status: 304 })
    }
  }

  const bundle = await rebuildIssuedPass(serialNumber)
  if (!bundle) return new NextResponse(null, { status: 404 })

  return new NextResponse(new Uint8Array(bundle), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.apple.pkpass',
      'Content-Length': String(bundle.length),
      'Last-Modified': pass.updatedAt.toUTCString(),
      'Cache-Control': 'no-store',
    },
  })
}
