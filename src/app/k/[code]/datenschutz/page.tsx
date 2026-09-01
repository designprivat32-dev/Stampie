import { resolveHandoutCode } from '@/lib/cards/handout-service'
import { PrivacyNotice, PrivacyShell } from '@/components/privacy-notice'

export const dynamic = 'force-dynamic'

/**
 * Die Datenschutzinformation, erreicht über den Ausgabe-Code.
 *
 * Das ist der Weg *vor* der Karte: der Kunde steht im Laden, hat gescannt und noch nichts
 * hinzugefügt. Genau dieser Moment ist gemeint, wenn Art. 13 „zum Zeitpunkt der Erhebung"
 * sagt — beim Öffnen der Seite wird nichts gespeichert, erst beim Tippen auf einen
 * Wallet-Knopf entsteht ein Pass.
 *
 * Der Weg *nach* der Karte liegt unter `/s/<serial>/datenschutz`.
 */
export default async function HandoutPrivacyPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  const resolved = await resolveHandoutCode(code)

  if (!resolved) {
    return (
      <PrivacyShell title="Nicht verfügbar">
        <p className="text-[14px] leading-relaxed text-ink-2">
          Dieser Code gehört zu keiner aktiven Stempelkarte.
        </p>
      </PrivacyShell>
    )
  }

  return (
    <PrivacyNotice
      shop={{ organizationName: resolved.organizationName, ...resolved.customer }}
      backHref={`/k/${code}`}
    />
  )
}
