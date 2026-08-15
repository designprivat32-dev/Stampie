import 'server-only'
import { prisma } from '@/lib/db'
import { readAppleWalletCredentials } from '@/lib/pass/apple-pass-builder'
import { sendPassUpdatePush } from '@/lib/pass/apple-apns'

/**
 * Tells every iPhone holding this pass that something changed.
 *
 * The counterpart to `syncGoogleStampCount`, and the harder half: Google takes a PATCH and
 * distributes the new value itself, while Apple only lets us knock. The push carries no
 * data — each device that receives one comes back to `/api/apple-passkit/...` and pulls a
 * freshly built pass, which is why the stamp row is rendered server-side to begin with.
 *
 * Best-effort by design. The stamp is already booked and audited when this runs; a phone
 * that is off, or a push that fails, must never turn a successful scan at the till into an
 * error. What it costs is a stale card until the customer opens Wallet next.
 */

export type AppleSyncResult =
  | { status: 'updated'; devices: number }
  /** No certificate configured, or the pass predates the web service — nothing to do. */
  | { status: 'not_configured' }
  /** Nobody installed this pass on an iPhone. Normal, not a failure. */
  | { status: 'no_devices' }
  | { status: 'error'; message: string }

export async function pushAppleWalletUpdate(serial: string): Promise<AppleSyncResult> {
  const credentials = readAppleWalletCredentials()
  if (!credentials) return { status: 'not_configured' }

  const pass = await prisma.issuedPass.findFirst({
    where: { serial },
    select: { id: true, appleRegistrations: { select: { id: true, pushToken: true } } },
  })
  if (!pass) return { status: 'not_configured' }
  if (pass.appleRegistrations.length === 0) return { status: 'no_devices' }

  try {
    const results = await Promise.all(
      pass.appleRegistrations.map(async (registration) => {
        const result = await sendPassUpdatePush(
          registration.pushToken,
          credentials.passTypeIdentifier,
          credentials.certificatePem,
          credentials.privateKeyPem,
        )

        // 410 is Apple saying this device no longer holds the pass. Keeping the row would
        // mean pushing into the void on every future stamp, forever.
        if (!result.ok && result.deviceGone) {
          await prisma.appleDeviceRegistration.delete({ where: { id: registration.id } })
        } else if (!result.ok) {
          // eslint-disable-next-line no-console
          console.error(
            `[apple-wallet] push for ${serial} failed: ${result.status} ${result.reason}`,
          )
        }

        return result.ok
      }),
    )

    const delivered = results.filter(Boolean).length
    return delivered > 0 ? { status: 'updated', devices: delivered } : { status: 'no_devices' }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown'
    // eslint-disable-next-line no-console
    console.error(`[apple-wallet] push for ${serial} threw: ${message}`)
    return { status: 'error', message }
  }
}
