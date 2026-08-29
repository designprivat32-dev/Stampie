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

/**
 * How many phones are pushed at once when a whole card is republished.
 *
 * Each push is its own HTTP/2 connection to Apple. Firing a thousand at once would open a
 * thousand sockets and, on a serverless runtime, likely hit a file-descriptor or memory
 * ceiling long before Apple complains. Batching keeps it boring.
 */
const PUSH_BATCH_SIZE = 20

export interface CardPushSummary {
  /** Passes that had at least one iPhone registered. */
  passes: number
  /** Individual devices reached. */
  devices: number
  failed: number
}

/**
 * Tells every iPhone holding *any* pass of this card that the design changed.
 *
 * Publishing a new design is the other event that makes an installed pass stale — the pass
 * endpoint rebuilds from the currently published design, so the new look is already
 * waiting there; without this nobody ever goes and asks for it. Until this existed a shop
 * could change its colours and see nothing happen on real phones until the next stamp
 * happened to knock.
 *
 * Best-effort, like the single-pass version: the design is published and saved before this
 * runs, and a phone that is off must not turn a successful publish into an error.
 */
export async function pushAppleWalletUpdateForCard(cardId: string): Promise<CardPushSummary> {
  const empty: CardPushSummary = { passes: 0, devices: 0, failed: 0 }
  if (!readAppleWalletCredentials()) return empty

  // Only passes an iPhone actually registered for. A card handed out a thousand times but
  // never added to Wallet has nothing to push to.
  const passes = await prisma.issuedPass.findMany({
    where: { cardId, appleRegistrations: { some: {} } },
    select: { serial: true },
  })
  if (passes.length === 0) return empty

  /*
   * Mark the passes as changed before knocking.
   *
   * Publishing writes a new CardDesign row; the IssuedPass rows are untouched. But the
   * device answers a push by asking "which of my passes changed since <tag>", and that
   * question is answered from `IssuedPass.updatedAt`. Without this the list comes back
   * empty, the device concludes nothing happened, and Apple logs it as a spurious push —
   * which is exactly what happened before this line existed.
   *
   * Semantically honest, not a trick: the pass really did change. The bundle is rebuilt
   * from the published design on every fetch, so its content is new from this moment.
   */
  await prisma.issuedPass.updateMany({
    where: { cardId, appleRegistrations: { some: {} } },
    data: { updatedAt: new Date() },
  })

  const summary = { ...empty }

  for (let i = 0; i < passes.length; i += PUSH_BATCH_SIZE) {
    const batch = passes.slice(i, i + PUSH_BATCH_SIZE)
    const results = await Promise.all(batch.map((p) => pushAppleWalletUpdate(p.serial)))

    for (const result of results) {
      if (result.status === 'updated') {
        summary.passes++
        summary.devices += result.devices
      } else if (result.status === 'error') {
        summary.failed++
      }
    }
  }

  return summary
}

/**
 * Dasselbe für eine ausgewählte Handvoll Pässe statt für die ganze Karte.
 *
 * Gebraucht für Nachrichten an eine Gruppe: die Meldung hängt dann am einzelnen Pass, also
 * darf auch nur bei diesen Pässen angeklopft werden. Ein Push an alle würde die Übrigen
 * ihre Karte neu laden lassen — unsichtbar, aber Apple zählt es als grundlosen Push.
 */
export async function pushAppleWalletUpdateForPasses(serials: string[]): Promise<CardPushSummary> {
  const empty: CardPushSummary = { passes: 0, devices: 0, failed: 0 }
  if (serials.length === 0 || !readAppleWalletCredentials()) return empty

  const passes = await prisma.issuedPass.findMany({
    where: { serial: { in: serials }, appleRegistrations: { some: {} } },
    select: { serial: true },
  })
  if (passes.length === 0) return empty

  // Gleicher Grund wie beim Kartenlauf: das Gerät fragt "was hat sich seit <tag> geändert",
  // und diese Frage beantwortet `updatedAt`. Ohne das kommt die Liste leer zurück.
  await prisma.issuedPass.updateMany({
    where: { serial: { in: passes.map((p) => p.serial) } },
    data: { updatedAt: new Date() },
  })

  const summary = { ...empty }

  for (let i = 0; i < passes.length; i += PUSH_BATCH_SIZE) {
    const batch = passes.slice(i, i + PUSH_BATCH_SIZE)
    const results = await Promise.all(batch.map((p) => pushAppleWalletUpdate(p.serial)))

    for (const result of results) {
      if (result.status === 'updated') {
        summary.passes++
        summary.devices += result.devices
      } else if (result.status === 'error') {
        summary.failed++
      }
    }
  }

  return summary
}

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
