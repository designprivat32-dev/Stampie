import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { rowToDesign } from '@/lib/cards/repository'
import { renderStripImage } from '@/lib/cards/render-strip'
import { loadStripAssets } from '@/lib/cards/asset-service'
import { STAMP_GOAL_MAX } from '@/lib/cards/schema'

export const runtime = 'nodejs'

/**
 * The stamp row as Google Wallet's `heroImage` (1032x336, 3:1).
 *
 * Google renders passes from URLs its own servers fetch, so this has to be public and
 * unauthenticated — a session check would leave every saved card without its stamps.
 * Nothing is exposed that the card holder cannot already see.
 *
 * The stamp count travels in the query, which is also how an update works: a new stamp
 * produces a new URL, and Google re-fetches instead of serving a cached image.
 */
const querySchema = z.object({
  s: z.coerce.number().int().min(0).max(STAMP_GOAL_MAX).catch(0),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ cardId: string }> },
): Promise<Response> {
  const { cardId } = await params
  const { s } = querySchema.parse({ s: request.nextUrl.searchParams.get('s') ?? 0 })

  const published = await prisma.cardDesign.findFirst({ where: { cardId, status: 'PUBLISHED' } })
  const row = published ?? (await prisma.cardDesign.findFirst({ where: { cardId, status: 'DRAFT' } }))
  if (!row) return new NextResponse(null, { status: 404 })

  const design = rowToDesign(row)
  const assets = await loadStripAssets(design, cardId)

  // Same renderer as the editor preview and the .pkpass — one renderer, one truth.
  const png = await renderStripImage(design, Math.min(s, design.stampGoal), 1, {
    target: 'google',
    customIconPng: assets.customIconPng,
    backgroundPng: assets.backgroundPng,
  })

  return new NextResponse(new Uint8Array(png), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(png.length),
      'Cache-Control': 'public, max-age=300',
    },
  })
}
