import { headers } from 'next/headers'
import { detectPlatform, resolveTestCardToken } from '@/lib/cards/test-card-service'
import { AppleWalletButton, GoogleWalletButton } from '@/components/wallet-badges'

export const dynamic = 'force-dynamic'

/**
 * Landing page for the test-card QR code.
 *
 * The device is detected only to decide which button leads — never to redirect. Sending
 * the top-level navigation to a `.pkpass` hands the browser a download instead of a
 * document, and Wallet's sheet then opens over a blank screen that the customer is still
 * looking at afterwards. Same reasoning as `/k/[code]`.
 */
export default async function TestCardLandingPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const resolved = await resolveTestCardToken(token)

  if (!resolved) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-lg font-semibold text-ink">Link abgelaufen</h1>
        <p className="text-sm text-ink-2">
          Testkarten-Links sind 30 Minuten gültig. Bitte im Dashboard eine neue Testkarte erzeugen.
        </p>
      </main>
    )
  }

  const platform = detectPlatform((await headers()).get('user-agent'))
  const name = resolved.design.programName.trim() || 'Stempelkarte'

  const apple = (
    <AppleWalletButton key="apple" href={`/api/test-card/${token}?p=apple`} className="w-full justify-center" />
  )
  const google = (
    <GoogleWalletButton key="google" href={`/api/test-card/${token}?p=google`} className="w-full justify-center" />
  )
  const buttons = platform === 'google' ? [google, apple] : [apple, google]

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="space-y-1">
        <p className="text-[13px] uppercase tracking-wide text-ink-3">Testkarte</p>
        <h1 className="text-xl font-semibold text-ink">{name}</h1>
        <p className="text-sm text-ink-2">
          Wähle aus, in welches Wallet die Karte gelegt werden soll.
        </p>
      </div>

      <div className="flex w-full flex-col gap-3">{buttons}</div>

      <p className="text-[12px] text-ink-3">Dieser Link ist 30 Minuten gültig.</p>
    </main>
  )
}
