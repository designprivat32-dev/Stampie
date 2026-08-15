import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

/**
 * Where Wallet reports its own problems.
 *
 * Worth having precisely because PassKit is otherwise silent: when a device rejects a pass
 * or cannot reach an endpoint, this is the only place that says so in words. Without it,
 * debugging is guesswork about a phone we cannot see.
 *
 * Unauthenticated — Apple sends no token here — so nothing is stored, only logged.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as { logs?: unknown }
    const entries = Array.isArray(body.logs) ? body.logs : []
    for (const entry of entries.slice(0, 20)) {
      // eslint-disable-next-line no-console
      console.error(`[apple-passkit] ${String(entry)}`)
    }
  } catch {
    // A malformed log post is not worth a failure response — Wallet would just retry it.
  }

  return new NextResponse(null, { status: 200 })
}
