import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { assertCardAccess, CardAccessError, UnauthorizedError } from '@/lib/auth/session'
import { renderStripCached } from '@/lib/cards/strip-service'
import { DEFAULT_CARD_DESIGN } from '@/lib/cards/defaults'
import {
  emptyStampStyleSchema,
  hexColorSchema,
  STAMP_GOAL_MAX,
  STAMP_GOAL_MIN,
} from '@/lib/cards/schema'

export const runtime = 'nodejs'

/**
 * The live preview renders through the exact same code path as the real pass. That is the
 * whole point: preview and card cannot drift, because there is only one renderer.
 *
 * The design is passed in the query rather than read from the database, because the
 * preview has to show *unsaved* editor state. Access control is therefore the tenant
 * check below, not a signature — the caller must be a logged-in member of the location.
 *
 * `v` is a hash of the render-relevant fields, which makes every distinct design state
 * its own immutable URL: the browser caches it forever and a change produces a new URL,
 * so the preview swaps without flicker and without cache busting by timestamp.
 */

const querySchema = z.object({
  card: z.string().cuid(),
  n: z.coerce.number().int().min(STAMP_GOAL_MIN).max(STAMP_GOAL_MAX),
  s: z.coerce.number().int().min(0).max(STAMP_GOAL_MAX),
  fg: hexColorSchema,
  bg: hexColorSchema,
  icon: z.string().min(1).max(64),
  empty: emptyStampStyleSchema,
  iconAsset: z.string().cuid().nullable().catch(null),
  heroAsset: z.string().cuid().nullable().catch(null),
  t: z.enum(['apple', 'google']).default('apple'),
  x: z.coerce.number().int().min(1).max(3).default(2),
})

export async function GET(request: NextRequest): Promise<Response> {
  const params = Object.fromEntries(request.nextUrl.searchParams.entries())
  // The colour params travel without the leading '#' so the URL stays readable.
  const normalised = {
    ...params,
    fg: params.fg ? `#${params.fg.replace(/^#/, '')}` : undefined,
    bg: params.bg ? `#${params.bg.replace(/^#/, '')}` : undefined,
    iconAsset: params.iconAsset || null,
    heroAsset: params.heroAsset || null,
  }

  const parsed = querySchema.safeParse(normalised)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Ungültige Vorschau-Parameter.' }, { status: 400 })
  }

  const q = parsed.data

  try {
    await assertCardAccess(q.card)
  } catch (e) {
    if (e instanceof UnauthorizedError) return new NextResponse(null, { status: 401 })
    if (e instanceof CardAccessError) return new NextResponse(null, { status: 404 })
    throw e
  }

  const png = await renderStripCached({
    cardId: q.card,
    currentStamps: Math.min(q.s, q.n),
    scale: q.x as 1 | 2 | 3,
    target: q.t,
    design: {
      ...DEFAULT_CARD_DESIGN,
      stampGoal: q.n,
      foregroundColor: q.fg,
      backgroundColor: q.bg,
      stampIcon: q.icon,
      emptyStampStyle: q.empty,
      stampIconAssetId: q.iconAsset,
      heroAssetId: q.heroAsset,
    },
  })

  return new NextResponse(new Uint8Array(png), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(png.length),
      // Immutable: the `v` parameter changes whenever the pixels would.
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  })
}
