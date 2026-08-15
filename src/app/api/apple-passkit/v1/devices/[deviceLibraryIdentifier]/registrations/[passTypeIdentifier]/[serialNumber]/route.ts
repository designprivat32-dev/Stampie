import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { verifyApplePassAuth } from '@/lib/pass/apple-passkit-auth'

export const runtime = 'nodejs'

/**
 * Apple's device registration endpoint. The path shape is dictated by PassKit, not by us:
 * Wallet builds this URL itself from `webServiceURL` in the pass, so every segment has to
 * sit exactly where Apple expects it.
 *
 * POST — the customer just added the pass; remember which device to wake later.
 * DELETE — they removed it; forget the device, or we push into the void forever.
 *
 * Called by Apple's servers, never by our own UI. Authentication is the `ApplePass` token
 * baked into that one pass, so a caller can only ever touch the pass it holds.
 */

interface RouteContext {
  params: Promise<{
    deviceLibraryIdentifier: string
    passTypeIdentifier: string
    serialNumber: string
  }>
}

const bodySchema = z.object({ pushToken: z.string().min(1).max(400) })

export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  const { deviceLibraryIdentifier, passTypeIdentifier, serialNumber } = await context.params

  const pass = await verifyApplePassAuth(
    passTypeIdentifier,
    serialNumber,
    request.headers.get('authorization'),
  )
  if (!pass) return new NextResponse(null, { status: 401 })

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return new NextResponse(null, { status: 400 })
  }

  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) return new NextResponse(null, { status: 400 })

  const existing = await prisma.appleDeviceRegistration.findFirst({
    where: { deviceLibraryIdentifier, passId: pass.id },
    select: { id: true },
  })

  // Apple distinguishes the two: 200 means "already had it", 201 means "newly stored".
  // Wallet retries on anything else, so answering 201 twice invites a registration storm.
  if (existing) {
    await prisma.appleDeviceRegistration.update({
      where: { id: existing.id },
      data: { pushToken: parsed.data.pushToken },
    })
    return new NextResponse(null, { status: 200 })
  }

  await prisma.appleDeviceRegistration.create({
    data: {
      deviceLibraryIdentifier,
      passId: pass.id,
      pushToken: parsed.data.pushToken,
    },
  })
  return new NextResponse(null, { status: 201 })
}

export async function DELETE(request: NextRequest, context: RouteContext): Promise<Response> {
  const { deviceLibraryIdentifier, passTypeIdentifier, serialNumber } = await context.params

  const pass = await verifyApplePassAuth(
    passTypeIdentifier,
    serialNumber,
    request.headers.get('authorization'),
  )
  if (!pass) return new NextResponse(null, { status: 401 })

  await prisma.appleDeviceRegistration.deleteMany({
    where: { deviceLibraryIdentifier, passId: pass.id },
  })

  return new NextResponse(null, { status: 200 })
}
