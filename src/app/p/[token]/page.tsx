import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { detectPlatform, resolveTestCardToken } from '@/lib/cards/test-card-service'

export const dynamic = 'force-dynamic'

/**
 * Landing page for the test-card QR code.
 *
 * iOS and Android are sent straight through to the right download, so the path from scan
 * to card-in-wallet is one redirect. Everything else (desktop, in-app browsers we cannot
 * classify) gets an explicit choice instead of a wrong guess.
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
  if (platform === 'apple') redirect(`/api/test-card/${token}?p=apple`)
  if (platform === 'google') redirect(`/api/test-card/${token}?p=google`)

  const name = resolved.design.programName.trim() || 'Stempelkarte'

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="space-y-1">
        <p className="text-[13px] uppercase tracking-wide text-ink-3">Testkarte</p>
        <h1 className="text-xl font-semibold text-ink">{name}</h1>
        <p className="text-sm text-ink-2">
          Wähle aus, in welches Wallet die Karte gelegt werden soll.
        </p>
      </div>

      <div className="flex w-full flex-col gap-3">
        <a
          href={`/api/test-card/${token}?p=apple`}
          className="flex h-12 items-center justify-center rounded-lg bg-ink px-5 text-sm font-medium text-white"
        >
          Zu Apple Wallet hinzufügen
        </a>
        <a
          href={`/api/test-card/${token}?p=google`}
          className="flex h-12 items-center justify-center rounded-lg border border-line bg-surface px-5 text-sm font-medium text-ink"
        >
          Zu Google Wallet hinzufügen
        </a>
      </div>

      <p className="text-[12px] text-ink-3">Dieser Link ist 30 Minuten gültig.</p>
    </main>
  )
}
