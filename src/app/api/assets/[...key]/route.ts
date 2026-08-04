import { NextResponse, type NextRequest } from 'next/server'
import { getStorage } from '@/lib/storage'

export const runtime = 'nodejs'

/**
 * Serves uploaded assets when the filesystem storage adapter is active (development).
 * With S3 the public URL points at the bucket and this route is never hit.
 *
 * Deliberately public: logo and hero URLs are embedded into Google Wallet passes and are
 * fetched by Google's servers. Keys contain cuids, so they are unguessable.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> },
): Promise<Response> {
  const { key } = await params
  const joined = key.join('/')

  // Defence in depth — the adapter also range-checks the resolved path.
  if (joined.includes('..') || joined.includes('\\')) {
    return new NextResponse(null, { status: 400 })
  }

  const storage = await getStorage()
  const data = await storage.get(joined)
  if (!data) return new NextResponse(null, { status: 404 })

  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(data.length),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
