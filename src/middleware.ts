import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { DASHBOARD_COOKIE, DASHBOARD_TOKEN_PREFIX } from '@/lib/auth/dashboard-cookie'

/**
 * Two unrelated concerns, one file, because Next allows exactly one middleware:
 *
 *  1. CORS for the business-app API (`/api/app/*`). The native app is not subject to CORS,
 *     but the browser web-preview (Expo web on localhost:8081) calls the backend
 *     cross-origin (localhost:3000). Without these headers the browser blocks the request.
 *     Tokens travel in the Authorization header (no cookies), so reflecting the origin is
 *     safe.
 *
 *  2. The dashboard gate (`/dashboard/*`). This is a *cheap* check — is a dashboard-shaped
 *     cookie present at all — because middleware runs on the edge and Prisma does not. The
 *     real check is `getSession()` in each page, which validates the session against the
 *     database and re-checks the operator allowlist. This only saves an unauthenticated
 *     visitor from rendering a page that would redirect anyway.
 */
export function middleware(req: NextRequest): NextResponse {
  if (req.nextUrl.pathname.startsWith('/dashboard')) return dashboardGate(req)
  return appApiCors(req)
}

function dashboardGate(req: NextRequest): NextResponse {
  // Die lokale Entwickler-Sitzung kommt ohne Cookie aus (siehe `devSession` in
  // `lib/auth/session`). Ohne diese Ausnahme schickt das Gate sie auf /login, /login
  // findet eine gültige Sitzung und schickt zurück — eine Schleife, die das Dashboard
  // lokal unerreichbar macht. Die Bedingung ist dieselbe wie dort, damit die beiden
  // nicht auseinanderlaufen können.
  if (process.env.NODE_ENV !== 'production' && process.env.DEV_SESSION_USER_EMAIL) {
    return NextResponse.next()
  }

  const token = req.cookies.get(DASHBOARD_COOKIE)?.value
  if (token?.startsWith(DASHBOARD_TOKEN_PREFIX)) return NextResponse.next()

  const login = new URL('/login', req.url)
  login.searchParams.set('next', req.nextUrl.pathname + req.nextUrl.search)
  return NextResponse.redirect(login)
}

function appApiCors(req: NextRequest): NextResponse {
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

export const config = { matcher: ['/api/app/:path*', '/dashboard/:path*'] }
