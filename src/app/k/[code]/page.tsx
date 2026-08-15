import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { detectPlatform } from '@/lib/cards/test-card-service'
import {
  DEVICE_COOKIE,
  DEVICE_COOKIE_MAX_AGE,
  newDeviceKey,
  resolveHandoutCode,
} from '@/lib/cards/handout-service'

export const dynamic = 'force-dynamic'

/**
 * Where the NFC chip and the counter QR point.
 *
 * The chip stores this URL and nothing else — tapping it opens this page, on any phone,
 * without an app. iOS and Android are sent straight to the right wallet, so the customer
 * sees one system dialog and is done. Everything we cannot classify gets a choice instead
 * of a wrong guess.
 *
 * The device cookie is set *here* rather than in the download route: a redirect sets it
 * just as well, but only this page is guaranteed to run before either wallet path, and the
 * cookie is what makes a second tap return the same card.
 */
export default async function HandoutLandingPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  const resolved = await resolveHandoutCode(code)

  if (!resolved) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-lg font-semibold text-ink">Karte nicht verfügbar</h1>
        <p className="text-sm text-ink-2">
          Dieser Code gehört zu keiner aktiven Stempelkarte. Bitte im Laden nachfragen.
        </p>
      </main>
    )
  }

  const jar = await cookies()
  if (!jar.get(DEVICE_COOKIE)) {
    jar.set(DEVICE_COOKIE, newDeviceKey(), {
      maxAge: DEVICE_COOKIE_MAX_AGE,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    })
  }

  const platform = detectPlatform((await headers()).get('user-agent'))
  if (platform === 'apple') redirect(`/api/k/${code}?p=apple`)
  if (platform === 'google') redirect(`/api/k/${code}?p=google`)

  const name = resolved.design.programName.trim() || 'Stempelkarte'

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="space-y-1">
        <p className="text-[13px] uppercase tracking-wide text-ink-3">
          {resolved.organizationName}
        </p>
        <h1 className="text-xl font-semibold text-ink">{name}</h1>
        <p className="text-sm text-ink-2">
          Wähle aus, in welches Wallet die Karte gelegt werden soll.
        </p>
      </div>

      <div className="flex w-full flex-col gap-2">
        <a
          href={`/api/k/${code}?p=apple`}
          className="rounded-lg bg-ink px-4 py-3 text-[14px] font-medium text-surface"
        >
          Zu Apple Wallet hinzufügen
        </a>
        <a
          href={`/api/k/${code}?p=google`}
          className="rounded-lg border border-line px-4 py-3 text-[14px] font-medium text-ink"
        >
          Zu Google Wallet hinzufügen
        </a>
      </div>

      <p className="text-[12px] leading-snug text-ink-3">
        Beim nächsten Antippen bekommst du wieder dieselbe Karte — mit den Stempeln, die
        bis dahin darauf sind.
      </p>
    </main>
  )
}
