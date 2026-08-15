import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * CORS for the business-app API (`/api/app/*`).
 *
 * The native app is not subject to CORS, but the browser web-preview (Expo web on
 * localhost:8081) calls the backend cross-origin (localhost:3000). Without these headers
 * the browser blocks the request. Tokens travel in the Authorization header (no cookies),
 * so reflecting the origin is safe.
 */
export function middleware(req: NextRequest): NextResponse {
  const origin = req.headers.get('origin') ?? '*'
  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }

  if (req.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers })
  }

  const res = NextResponse.next()
  for (const [key, value] of Object.entries(headers)) res.headers.set(key, value)
  return res
}

export const config = { matcher: '/api/app/:path*' }
