import { NextResponse, type NextRequest } from 'next/server'
import { deliverDueMessages } from '@/lib/cards/message-service'
import { deliverDueReminders } from '@/lib/cards/reminder-service'

export const runtime = 'nodejs'
/** Sending must never be served from a cache. */
export const dynamic = 'force-dynamic'

/**
 * Sends every message whose time has come.
 *
 * Deliberately indifferent to *who* calls it. Vercel's cron cannot run more than once a
 * day on the current plan, and the timing is only guaranteed within the hour — which would
 * make "choose a send time" a promise we could not keep. So this is a plain endpoint that
 * Vercel's cron, an external pinger or a person with curl can all trigger, and the
 * scheduler stays a deployment decision rather than something baked into the code.
 *
 * The secret is the whole access control: a public trigger would let anyone fire a shop's
 * queued messages at a time of their choosing. Without `CRON_SECRET` configured the
 * endpoint refuses outright rather than running unprotected.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET ist nicht gesetzt. Der Versand bleibt deshalb gesperrt.' },
      { status: 503 },
    )
  }

  // Vercel's cron sends exactly this header; anything else has to imitate it.
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Nicht berechtigt.' }, { status: 401 })
  }

  const result = await deliverDueMessages()
  // Im selben Lauf: wiederkehrende Karten-Erinnerungen, die heute fällig sind.
  const reminders = await deliverDueReminders()
  return NextResponse.json({ ok: true, ...result, reminders })
}
