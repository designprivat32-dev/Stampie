import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { rowToDesign } from '@/lib/cards/repository'
import { renderLogoImage, WALLET_LOGO_SIZE } from '@/lib/cards/render-logo'
import { getStorage, variantKey } from '@/lib/storage'

export const runtime = 'nodejs'

/**
 * Fallback `programLogo` for Google Wallet.
 *
 * Deliberately public and unauthenticated: Google's servers fetch this URL to build the
 * pass, so a session check would break every save. It exposes nothing beyond the card's
 * own colours and stamp icon, which the customer sees on the card anyway.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ cardId: string }> },
): Promise<Response> {
  const { cardId } = await params

  const row = await prisma.cardDesign.findFirst({
    where: { cardId, status: 'PUBLISHED' },
  })
  const fallback = row ?? (await prisma.cardDesign.findFirst({ where: { cardId, status: 'DRAFT' } }))

  if (!fallback) return new NextResponse(null, { status: 404 })

  const design = rowToDesign(fallback)

  // Preference order:
  //   1. a dedicated square logo — already the right shape for a circular crop
  //   2. the wide Apple logo, re-framed onto the card colour so it is not cropped to a sliver
  //   3. the stamp icon, generated
  const storage = await getStorage()

  const loadAsset = async (assetId: string | null, kind: 'LOGO' | 'SQUARE_LOGO') => {
    if (!assetId) return null
    const asset = await prisma.asset.findFirst({
      where: { id: assetId, cardId, kind },
      select: { storageKey: true },
    })
    if (!asset) return null
    // @3x where it exists has the most pixels to scale from.
    return (
      (await storage.get(variantKey(asset.storageKey, 3))) ??
      (await storage.get(variantKey(asset.storageKey, 1)))
    )
  }

  const square = await loadAsset(design.squareLogoAssetId, 'SQUARE_LOGO')
  const uploaded = square ?? (await loadAsset(design.logoAssetId, 'LOGO'))

  const png = await renderLogoImage(design, WALLET_LOGO_SIZE, uploaded)

  return new NextResponse(new Uint8Array(png), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(png.length),
      // Short cache: the logo follows the design, which the owner edits live.
      'Cache-Control': 'public, max-age=300',
    },
  })
}
