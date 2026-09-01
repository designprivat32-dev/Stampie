import { headers } from 'next/headers'
import { detectPlatform } from '@/lib/cards/test-card-service'
import { resolveHandoutCode, type ResolvedHandout } from '@/lib/cards/handout-service'
import Link from 'next/link'
import { AppleWalletButton, GoogleWalletButton } from '@/components/wallet-badges'
import { formatAddress, formatOpeningHours } from '@/types/customer'

export const dynamic = 'force-dynamic'

/**
 * Where the NFC chip and the counter QR point.
 *
 * The chip stores this URL and nothing else — tapping it opens this page, on any phone,
 * without an app.
 *
 * This page deliberately does *not* redirect straight to the pass. It used to, and the
 * result was a blank screen: sending the top-level navigation to a `.pkpass` gives the
 * browser a download instead of a document, so Wallet's sheet opened over nothing and the
 * customer was left staring at an empty page after adding the card. A tap on a link from
 * a rendered page behaves differently — the sheet opens *over this page*, and closing it
 * comes back here.
 *
 * The device decides which wallet button is shown: an iPhone gets Apple, an Android phone
 * gets Google. Only when the user agent says neither (a desktop, an in-app browser that
 * lies) do both appear, because guessing wrong there would look like an unsupported phone.
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

  const platform = detectPlatform((await headers()).get('user-agent'))
  const { design } = resolved

  const title = design.cardTitle?.trim() || design.programName.trim() || 'Stempelkarte'
  const reward = design.rewardText.trim()
  const stampLabel = design.stampLabel.trim() || 'Stempel'

  const apple = (
    <AppleWalletButton key="apple" href={`/api/k/${code}?p=apple`} size="lg" className="justify-center" />
  )
  const google = (
    <GoogleWalletButton key="google" href={`/api/k/${code}?p=google`} size="lg" className="justify-center" />
  )

  const buttons =
    platform === 'apple' ? [apple] : platform === 'google' ? [google] : [apple, google]

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 py-10">
      <div className="flex flex-1 flex-col justify-center gap-8">
        {/* The card's own colours and the shop's own mark, so the page reads as theirs. */}
        <div
          className="rounded-[28px] px-6 pb-8 pt-9 text-center shadow-[0_18px_40px_-24px_rgba(0,0,0,0.55)]"
          style={{ backgroundColor: design.backgroundColor, color: design.foregroundColor }}
        >
          <ShopMark cardId={resolved.cardId} foreground={design.foregroundColor} />

          <p className="mt-5 text-[12px] uppercase tracking-[0.14em] opacity-70">
            {resolved.organizationName}
          </p>
          <p className="mt-1.5 text-[25px] font-semibold leading-tight">{title}</p>

          {resolved.kind === 'STAMP' ? (
            <StampDots goal={design.stampGoal} foreground={design.foregroundColor} />
          ) : null}

          <p className="mt-4 text-[13px] leading-snug opacity-80">
            {resolved.kind === 'STAMP' ? `${design.stampGoal} ${stampLabel}` : 'Gutschein'}
            {reward ? ` — ${reward}` : ''}
          </p>
        </div>

        {resolved.greeting ? (
          <p className="text-center text-[15px] leading-snug text-ink-2">{resolved.greeting}</p>
        ) : null}

        <div className="flex flex-col items-center gap-3">{buttons}</div>

        <ShopDetails customer={resolved.customer} />
      </div>

      {/* Die Erhebung beginnt mit dem Tippen auf einen der Wallet-Knöpfe. Der Hinweis
          gehört deshalb auf diese Seite und nicht auf eine Website, die der Kunde im Laden
          nie aufruft. */}
      <p className="pt-8 text-center text-[12px] text-ink-3">
        <Link
          href={`/k/${code}/datenschutz`}
          className="underline underline-offset-2 hover:text-ink"
        >
          Datenschutzhinweise
        </Link>
      </p>
    </main>
  )
}

/**
 * The shop's logo above the card title.
 *
 * `/api/wallet/logo` is the same square mark Google Wallet gets: the uploaded logo where
 * there is one, the stamp icon in the card's colours where there is not — so this never
 * renders an empty frame, and never a broken image. The tile behind it is drawn from the
 * card's own foreground colour at low alpha, which lands correctly on a light and on a
 * dark card without a second colour decision.
 */
function ShopMark({ cardId, foreground }: { cardId: string; foreground: string }) {
  return (
    <div
      className="mx-auto flex h-[88px] w-[88px] items-center justify-center overflow-hidden rounded-3xl border"
      style={{ backgroundColor: `${foreground}14`, borderColor: `${foreground}2b` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/wallet/logo/${cardId}`}
        alt=""
        width={88}
        height={88}
        className="h-[72px] w-[72px] object-contain"
      />
    </div>
  )
}

/**
 * The empty card, drawn as one dot per stamp.
 *
 * It shows what the customer is signing up for at a glance — five dots read faster than
 * "5 Stempel". Long programmes fall back to the sentence underneath: past ten, the dots
 * wrap into a block that says less than the number does.
 */
function StampDots({ goal, foreground }: { goal: number; foreground: string }) {
  if (goal < 2 || goal > 10) return null

  return (
    <div className="mt-5 flex flex-wrap justify-center gap-2" aria-hidden="true">
      {Array.from({ length: goal }, (_, i) => (
        <span
          key={i}
          className="h-[13px] w-[13px] rounded-full border"
          style={{ borderColor: `${foreground}66` }}
        />
      ))}
    </div>
  )
}

/**
 * The shop's own details under the buttons.
 *
 * Every line is optional and simply omitted when empty — a customer can exist before the
 * agency has captured an address, and an empty "Adresse:" label looks like a fault. The
 * whole block disappears when there is nothing at all to show.
 */
function ShopDetails({ customer }: { customer: ResolvedHandout['customer'] }) {
  const address = formatAddress(customer)
  const hours = formatOpeningHours(customer.openingHours)

  if (!address && !hours && !customer.phone && !customer.website) return null

  return (
    <div className="space-y-3 border-t border-line pt-5 text-center text-[12px] leading-relaxed text-ink-3">
      {address ? <p className="whitespace-pre-line">{address}</p> : null}

      {hours ? (
        <div>
          <p className="font-medium text-ink-2">Öffnungszeiten</p>
          <p className="whitespace-pre-line">{hours}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
        {customer.phone ? (
          <a href={`tel:${customer.phone.replace(/\s/g, '')}`} className="underline">
            {customer.phone}
          </a>
        ) : null}
        {customer.website ? (
          <a href={customer.website} rel="noreferrer" className="underline">
            Website
          </a>
        ) : null}
      </div>
    </div>
  )
}
