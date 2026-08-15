import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { readPassBuilderConfig } from '@/lib/pass/pass-builder'

export const runtime = 'nodejs'

/**
 * "Which of my passes changed?" — the device asks this after a push, listing the passes it
 * registered and the tag it got last time.
 *
 * The tag is a millisecond timestamp: everything written after it is what the device has
 * not seen. Apple hands it straight back as `passesUpdatedSince`, so it only has to be
 * comparable with itself, not meaningful to anyone else.
 *
 * Unauthenticated by PassKit's design — the device library identifier is the secret, and
 * the answer is a list of serials that device already holds.
 */

interface RouteContext {
  params: Promise<{ deviceLibraryIdentifier: string; passTypeIdentifier: string }>
}

export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  const { deviceLibraryIdentifier, passTypeIdentifier } = await context.params

  if (passTypeIdentifier !== readPassBuilderConfig().passTypeIdentifier) {
    return new NextResponse(null, { status: 404 })
  }

  const since = request.nextUrl.searchParams.get('passesUpdatedSince')
  const sinceDate = since ? new Date(Number(since)) : null
  const validSince = sinceDate && !Number.isNaN(sinceDate.getTime()) ? sinceDate : null

  const registrations = await prisma.appleDeviceRegistration.findMany({
    where: {
      deviceLibraryIdentifier,
      ...(validSince ? { pass: { updatedAt: { gt: validSince } } } : {}),
    },
    select: { pass: { select: { serial: true, updatedAt: true } } },
  })

  // 204 rather than an empty list: Apple treats "no content" as "nothing changed" and
  // stops there, while an empty array is a malformed answer to it.
  if (registrations.length === 0) return new NextResponse(null, { status: 204 })

  const lastUpdated = registrations.reduce(
    (max, r) => Math.max(max, r.pass.updatedAt.getTime()),
    0,
  )

  return NextResponse.json({
    serialNumbers: registrations.map((r) => r.pass.serial),
    lastUpdated: String(lastUpdated),
  })
}
