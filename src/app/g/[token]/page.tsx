import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { detectPlatform } from '@/lib/cards/test-card-service'
import { resolveClaimToken } from '@/lib/cards/reward-coupon'

export const dynamic = 'force-dynamic'

/**
 * Landing page behind the coupon QR shown at the till.
 *
 * The customer scans it with the phone already in their hand, so iOS and Android go
 * straight through — one scan, one redirect, coupon in the wallet. Anything we cannot
 * classify gets an explicit choice rather than a wrong guess.
 */
export default async function CouponClaimPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const resolved = await resolveClaimToken(token)

  if (!resolved) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-lg font-semibold text-ink">Gutschein nicht gefunden</h1>
        <p className="text-sm text-ink-2">
          Dieser Link gehört zu keinem gültigen Gutschein. Bitte im Laden nachfragen.
        </p>
      </main>
    )
  }

  // An already redeemed coupon still resolves — saying so is far better than handing out a
  // pass that the till will refuse in front of the next customer.
  if (resolved.redeemed) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-lg font-semibold text-ink">Gutschein bereits eingelöst</h1>
        <p className="text-sm text-ink-2">
          Dieser Gutschein wurde schon verwendet und kann nicht mehr hinzugefügt werden.
        </p>
      </main>
    )
  }

  const platform = detectPlatform((await headers()).get('user-agent'))
  if (platform === 'apple') redirect(`/api/coupon/${token}?p=apple`)
  if (platform === 'google') redirect(`/api/coupon/${token}?p=google`)

  const title = resolved.design.offerTitle?.trim() || 'Gutschein'

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="space-y-1">
        <p className="text-[13px] uppercase tracking-wide text-ink-3">Dein Gutschein</p>
        <h1 className="text-xl font-semibold text-ink">{title}</h1>
        <p className="text-sm text-ink-2">
          Wähle aus, in welches Wallet der Gutschein gelegt werden soll.
        </p>
      </div>

      <div className="flex w-full flex-col gap-3">
        <a
          href={`/api/coupon/${token}?p=apple`}
          className="flex h-12 items-center justify-center rounded-lg bg-ink px-5 text-sm font-medium text-white"
        >
          Zu Apple Wallet hinzufügen
        </a>
        <a
          href={`/api/coupon/${token}?p=google`}
          className="flex h-12 items-center justify-center rounded-lg border border-line bg-surface px-5 text-sm font-medium text-ink"
        >
          Zu Google Wallet hinzufügen
        </a>
      </div>
    </main>
  )
}
