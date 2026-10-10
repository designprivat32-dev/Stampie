import { AppleWalletButton } from '@/components/wallet-badges'
import { resolveOwnerClaim } from '@/lib/business-cards/scan-service'
import { BusinessCardFace } from '../../_components/business-card-face'

export const dynamic = 'force-dynamic'

/**
 * Die Seite hinter dem Link, den die Person aus dem Dashboard bekommt: hier holt sie sich
 * ihre eigene Visitenkarte mit QR-Code ins Wallet.
 *
 * Das Öffnen allein legt nichts an — eine Link-Vorschau im Messenger ruft die Seite auf,
 * nicht den Knopf.
 */
export default async function OwnerClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const card = await resolveOwnerClaim(token)

  if (!card) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-lg font-semibold text-ink">Link nicht mehr gültig</h1>
        <p className="text-sm text-ink-2">
          Dieser Link wurde ersetzt oder gehört zu keiner Visitenkarte. Bitte einen neuen Link anfordern.
        </p>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 py-10">
      <div className="flex flex-1 flex-col justify-center gap-8">
        <BusinessCardFace card={card} />

        <div className="space-y-2 text-center">
          <h1 className="text-[18px] font-semibold text-ink">Deine Visitenkarte fürs Wallet</h1>
          <p className="text-[14px] leading-snug text-ink-2">
            Auf deiner Karte steht ein QR-Code. Wer ihn mit der Kamera scannt, bekommt deine
            Visitenkarte — ganz ohne App.
          </p>
        </div>

        <div className="flex justify-center">
          <AppleWalletButton href={`/api/v/claim/${token}`} size="lg" className="justify-center" />
        </div>
      </div>
    </main>
  )
}
