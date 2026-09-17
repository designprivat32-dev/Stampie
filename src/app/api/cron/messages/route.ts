import { NextResponse, type NextRequest } from 'next/server'
import { deliverDueMessages } from '@/lib/cards/message-service'
import { deliverDueReminders } from '@/lib/cards/reminder-service'
import { runRetention } from '@/lib/privacy/retention'
import { rateLimit } from '@/lib/rate-limit'

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
 *
 * On top of that, one run per `MIN_INTERVAL_MS` — with the right secret or not. In
 * September 2026 an unknown cron-job.org job hit this route every minute with a valid
 * secret; each call ran three database jobs, the database never scaled to zero and Neon's
 * free compute allowance was gone in sixteen days. Nothing here needs to run more often
 * than every ten minutes, so anything faster is refused *before* the database is touched.
 * The limiter is in-memory, i.e. per warm instance — a caller frequent enough to matter is
 * also frequent enough to keep the instance warm, which is exactly when it bites.
 */

/** Runs closer together than this are refused. Vercel's daily cron is far below it. */
const MIN_INTERVAL_MS = 10 * 60 * 1000
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

  const gate = rateLimit('cron:messages', 1, MIN_INTERVAL_MS)
  if (!gate.allowed) {
    console.warn('[cron/messages] Aufruf zu dicht auf den letzten, abgewiesen', {
      userAgent: request.headers.get('user-agent'),
      ip: request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip'),
      nextAllowedAt: new Date(gate.resetAt).toISOString(),
    })
    return NextResponse.json(
      { error: 'Zu häufig. Der Versand läuft höchstens alle zehn Minuten.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((gate.resetAt - Date.now()) / 1000)) } },
    )
  }

  const result = await deliverDueMessages()
  // Im selben Lauf: wiederkehrende Karten-Erinnerungen, die heute fällig sind.
  const reminders = await deliverDueReminders()
  // Und zuletzt das Aufräumen — nach dem Versand, damit ein Fehler beim Löschen niemals
  // eine fällige Nachricht verschluckt.
  const retention = await runRetention()
  return NextResponse.json({ ok: true, ...result, reminders, retention })
}
