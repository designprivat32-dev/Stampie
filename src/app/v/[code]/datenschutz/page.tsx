import { resolveScanCode } from '@/lib/business-cards/scan-service'
import { BusinessCardPrivacyNotice } from '@/components/business-card-privacy-notice'
import { PrivacyShell } from '@/components/privacy-notice'

export const dynamic = 'force-dynamic'

/** Was die digitale Visitenkarte speichert — vor dem Hinzufügen und von der Rückseite des Passes. */
export default async function BusinessCardPrivacyPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  const card = await resolveScanCode(code)

  if (!card) {
    return (
      <PrivacyShell title="Nicht verfügbar">
        <p className="text-[14px] leading-relaxed text-ink-2">
          Dieser Code gehört zu keiner aktiven Visitenkarte.
        </p>
      </PrivacyShell>
    )
  }

  return <BusinessCardPrivacyNotice owner={card.owner} backHref={`/v/${code}`} />
}
