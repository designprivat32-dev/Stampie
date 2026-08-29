import { headers } from 'next/headers'
import { detectPlatform } from '@/lib/cards/test-card-service'
import { resolveHandoutCode, type ResolvedHandout } from '@/lib/cards/handout-service'
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

  const apple = <AppleWalletButton key="apple" href={`/api/k/${code}?p=apple`} className="justify-center" />
  const google = <GoogleWalletButton key="google" href={`/api/k/${code}?p=google`} className="justify-center" />

  const buttons =
    platform === 'apple' ? [apple] : platform === 'google' ? [google] : [apple, google]

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 py-10">
      <div className="flex flex-1 flex-col justify-center gap-7">
        {/* The card's own colours, so the page reads as the shop's, not as ours. */}
        <div
          className="rounded-2xl px-5 py-7 text-center"
          style={{ backgroundColor: design.backgroundColor, color: design.foregroundColor }}
        >
          <p className="text-[13px] opacity-75">{resolved.organizationName}</p>
          <p className="mt-1 text-[22px] font-semibold leading-tight">{title}</p>
          <p className="mt-3 text-[13px] opacity-75">
            {design.stampGoal} {design.stampLabel.trim() || 'Stempel'}
            {reward ? ` — ${reward}` : ''}
          </p>
        </div>

        {resolved.greeting ? (
          <p className="text-center text-[15px] leading-snug text-ink-2">{resolved.greeting}</p>
        ) : null}

        <div className="flex flex-col items-center gap-3">{buttons}</div>

        <ShopDetails customer={resolved.customer} />
      </div>
    </main>
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
