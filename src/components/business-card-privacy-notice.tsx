import Link from 'next/link'
import { readProcessor } from '@/lib/legal/processor'
import { readRetentionPolicy } from '@/lib/privacy/retention'
import { PrivacyShell, PrivacySection } from './privacy-notice'

/**
 * Datenschutzinformation zur digitalen Visitenkarte.
 *
 * Eigener Text, nicht der der Stempelkarte: die Visitenkarte zählt keine Besuche, fragt
 * keine Einwilligung ab und erkennt kein Gerät wieder. Der Text beschreibt ausschließlich,
 * was `lib/business-cards/scan-service.ts` tatsächlich speichert — wird dort etwas
 * hinzugefügt, gehört es hier mit hinein.
 */
export interface BusinessCardOwner {
  name: string
  street: string | null
  postalCode: string | null
  city: string | null
  phone: string | null
  email: string | null
}

export function BusinessCardPrivacyNotice({
  owner,
  backHref,
}: {
  owner: BusinessCardOwner
  backHref: string
}) {
  const address = [owner.street, [owner.postalCode, owner.city].filter(Boolean).join(' ')]
    .filter((part) => part && part.trim().length > 0)
    .join(', ')
  const { processor, missing } = readProcessor()
  const { businessCardEventDays, deletedContactDays } = readRetentionPolicy()

  return (
    <PrivacyShell title="Datenschutz">
      <p className="text-[13px] text-ink-3">Informationen zur digitalen Visitenkarte von {owner.name}.</p>

      <PrivacySection title="Wer verantwortlich ist">
        <p>
          <strong className="font-medium text-ink">{owner.name}</strong>
          {address ? <>, {address}</> : null}
        </p>
        {owner.phone ? <p>Telefon: {owner.phone}</p> : null}
        {owner.email ? <p>E-Mail: {owner.email}</p> : null}
      </PrivacySection>

      <PrivacySection title="Wer die Karte technisch betreibt">
        {processor ? (
          <p>
            Im Auftrag von {owner.name}:{' '}
            <strong className="font-medium text-ink">{processor.name}</strong>, {processor.address},{' '}
            {processor.email}. Der Betreiber verarbeitet ausschließlich weisungsgebunden.
          </p>
        ) : (
          <p className="text-danger">Angaben zum Auftragsverarbeiter fehlen ({missing.join(', ')}).</p>
        )}
      </PrivacySection>

      <PrivacySection title="Was über Sie gespeichert wird">
        <p>
          Wenn Sie die Visitenkarte in Ihr Wallet legen, entsteht eine Karte mit einer zufälligen
          Nummer. Dazu gespeichert werden der Zeitpunkt und technische Kennungen, damit sich die
          Karte in Apple Wallet oder Google Wallet aktualisieren kann, wenn sich Kontaktdaten
          ändern.
        </p>
        <p>
          <strong className="font-medium text-ink">
            Ihr Name, Ihre E-Mail-Adresse und Ihre Telefonnummer werden nicht erhoben.
          </strong>{' '}
          Es wird nichts abgefragt und nichts auf Ihrem Gerät abgelegt.
        </p>
        <p>
          Gezählt wird außerdem, wie oft die Seite aufgerufen, die Karte hinzugefügt oder der
          Kontakt gespeichert wurde — mit Gerätetyp (iPhone, Android, sonstige), aber ohne Bezug
          zu Ihnen. Diese Zählungen werden nach {businessCardEventDays} Tagen gelöscht.
        </p>
      </PrivacySection>

      <PrivacySection title="Wer die Daten außerdem erhält">
        <p>
          Die Karte liegt in Ihrem Wallet bei <strong className="font-medium text-ink">Apple</strong>{' '}
          oder <strong className="font-medium text-ink">Google</strong>. Gespeichert werden die
          Daten auf Servern in <strong className="font-medium text-ink">Frankfurt am Main</strong>{' '}
          (Neon, Vercel).
        </p>
      </PrivacySection>

      <PrivacySection title="Wie lange und Ihre Rechte">
        <p>
          Die Karte bleibt, bis Sie sie aus Ihrem Wallet löschen oder die Visitenkarte zurückgezogen
          wird. Wird sie zurückgezogen, erscheint sie in Ihrem Wallet als ungültig; die Daten dazu
          werden {deletedContactDays} Tage später endgültig gelöscht. Sie können Auskunft, Berichtigung oder Löschung verlangen und sich bei einer
          Datenschutz-Aufsichtsbehörde beschweren. Nennen Sie dabei die Nummer Ihrer Karte — ohne
          sie lässt sie sich nicht zuordnen.
        </p>
      </PrivacySection>

      <p className="pt-2 text-[12px] text-ink-3">
        <Link href={backHref} className="underline underline-offset-2 hover:text-ink">
          Zurück zur Visitenkarte
        </Link>
      </p>
    </PrivacyShell>
  )
}
