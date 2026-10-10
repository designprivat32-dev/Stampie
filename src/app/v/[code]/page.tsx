import Link from 'next/link'
import { headers } from 'next/headers'
import { AppleWalletButton } from '@/components/wallet-badges'
import { detectPlatform } from '@/lib/cards/test-card-service'
import { displayUrl } from '@/lib/business-cards/apple-pass-json'
import { recordBusinessCardEvent, resolveScanCode } from '@/lib/business-cards/scan-service'
import { BusinessCardFace } from '../_components/business-card-face'

export const dynamic = 'force-dynamic'

/**
 * Wohin der QR-Code auf dem Pass des Ausstellers zeigt.
 *
 * Wie bei der Stempelkarte kein direkter Sprung zum Pass, sondern eine Seite mit Knopf:
 * nur so öffnet sich Wallet *über* dieser Seite statt über einer leeren.
 *
 * Google Wallet folgt in Phase 4. Bis dahin bekommt ein Android-Telefon „Kontakt
 * speichern" — das funktioniert überall.
 */
export default async function BusinessCardScanPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  const card = await resolveScanCode(code)

  if (!card) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-lg font-semibold text-ink">Visitenkarte nicht verfügbar</h1>
        <p className="text-sm text-ink-2">Dieser Code gehört zu keiner aktiven Visitenkarte.</p>
      </main>
    )
  }

  const platform = detectPlatform((await headers()).get('user-agent'))
  await recordBusinessCardEvent(card.contactId, 'VIEWED', platform)

  const { contact, company } = card
  const showApple = platform !== 'google'
  const phone = contact.mobile ?? contact.phone ?? company?.phone ?? null

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 py-10">
      <div className="flex flex-1 flex-col justify-center gap-8">
        <BusinessCardFace card={card} />

        <div className="flex flex-col items-center gap-3">
          {showApple ? (
            <AppleWalletButton href={`/api/v/${code}/apple`} size="lg" className="justify-center" />
          ) : null}
          <a
            href={`/api/v/${code}/vcard`}
            className="flex h-12 w-full max-w-[280px] items-center justify-center rounded-xl border border-line bg-surface text-[15px] font-medium text-ink hover:bg-surface-2"
          >
            Kontakt speichern
          </a>
        </div>

        <ContactLinks phone={phone} email={contact.email} website={company?.website ?? null} />

        <p className="flex items-center justify-center gap-3 text-center text-[12px] text-ink-3">
          {card.owner.imprintUrl ? (
            <>
              <a
                href={card.owner.imprintUrl}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 hover:text-ink"
              >
                Impressum
              </a>
              <span aria-hidden>·</span>
            </>
          ) : null}
          <Link href={`/v/${code}/datenschutz`} className="underline underline-offset-2 hover:text-ink">
            Datenschutzhinweise
          </Link>
        </p>
      </div>
    </main>
  )
}

/** Direkt anrufen, schreiben, ansehen — ohne erst etwas zu speichern. */
function ContactLinks({
  phone,
  email,
  website,
}: {
  phone: string | null
  email: string | null
  website: string | null
}) {
  if (!phone && !email && !website) return null
  return (
    <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 border-t border-line pt-5 text-[13px] text-ink-2">
      {phone ? (
        <a href={`tel:${phone.replace(/[^+0-9]/g, '')}`} className="underline underline-offset-2">
          {phone}
        </a>
      ) : null}
      {email ? (
        <a href={`mailto:${email}`} className="underline underline-offset-2">
          {email}
        </a>
      ) : null}
      {website ? (
        <a href={website} rel="noreferrer" className="underline underline-offset-2">
          {displayUrl(website)}
        </a>
      ) : null}
    </div>
  )
}
