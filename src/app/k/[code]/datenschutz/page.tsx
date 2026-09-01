import Link from 'next/link'
import { resolveHandoutCode } from '@/lib/cards/handout-service'
import { readProcessor } from '@/lib/legal/processor'
import { readRetentionPolicy } from '@/lib/privacy/retention'

export const dynamic = 'force-dynamic'

/**
 * Die Datenschutzinformation zu genau dieser Karte.
 *
 * Sie liegt bewusst unter dem Ausgabe-Code und nicht unter einer eigenen Adresse je
 * Betrieb: der Code existiert bereits, ist eindeutig, steht auf dem Aufsteller und braucht
 * keine zweite Kennung, die kollidieren oder veralten könnte.
 *
 * Verantwortlich ist der Betrieb — er entscheidet über die Karte und kennt den Kunden.
 * Dieses Unternehmen verarbeitet nur in seinem Auftrag. Beide stehen deshalb hier, mit
 * Anschrift, denn genau das verlangt Art. 13 im Moment der Erhebung. Und der Moment der
 * Erhebung ist der Scan, nicht der Besuch einer Website.
 *
 * Der Text beschreibt ausschließlich, was das System tatsächlich speichert. Wird das
 * Schema erweitert, gehört diese Seite mit angepasst.
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
      <Shell title="Nicht verfügbar">
        <p className="text-[14px] leading-relaxed text-ink-2">
          Dieser Code gehört zu keiner aktiven Stempelkarte.
        </p>
      </Shell>
    )
  }

  const { customer, organizationName } = resolved
  const address = [customer.street, [customer.postalCode, customer.city].filter(Boolean).join(' ')]
    .filter((part) => part && part.trim().length > 0)
    .join(', ')
  const { processor, missing } = readProcessor()
  // Ohne hinterlegte Stammdaten hat der Betrieb hier keine Anlaufstelle. Dann darf der
  // Text nicht auf eine Adresse verweisen, die gar nicht dasteht.
  const hasContact = Boolean(address || customer.phone || customer.email)
  // Die genannte Frist ist die, die der Aufräum-Lauf tatsächlich anwendet — keine Zahl,
  // die hier steht und sonst nirgends gilt.
  const { stampEventDays } = readRetentionPolicy()

  return (
    <Shell title="Datenschutz">
      <p className="text-[13px] text-ink-3">
        Informationen zur digitalen Stempelkarte von {organizationName}.
      </p>

      <Section title="Wer für Ihre Daten verantwortlich ist">
        <p>
          <strong className="font-medium text-ink">{organizationName}</strong>
          {address ? <>, {address}</> : null}
        </p>
        {customer.phone ? <p>Telefon: {customer.phone}</p> : null}
        {customer.email ? <p>E-Mail: {customer.email}</p> : null}
        <p>
          {hasContact
            ? 'An diese Adresse richten Sie Auskunfts- und Löschanfragen zu Ihrer Stempelkarte.'
            : 'Für Auskunft oder Löschung wenden Sie sich bitte direkt an den Betrieb.'}
        </p>
      </Section>

      <Section title="Wer die Karte technisch betreibt">
        {processor ? (
          <p>
            Im Auftrag des Betriebs: <strong className="font-medium text-ink">{processor.name}</strong>,{' '}
            {processor.address}, {processor.email}. Der Betrieb bleibt verantwortlich; der
            Betreiber verarbeitet ausschließlich weisungsgebunden.
          </p>
        ) : (
          // Lieber sichtbar unvollständig als still falsch: eine Datenschutzinformation
          // ohne den Auftragsverarbeiter erfüllt ihren Zweck nicht.
          <p className="text-danger">
            Angaben zum Auftragsverarbeiter fehlen ({missing.join(', ')}).
          </p>
        )}
      </Section>

      <Section title="Welche Daten gespeichert werden">
        <ul className="list-disc space-y-1 pl-5">
          <li>die Nummer Ihrer Karte</li>
          <li>Ihr Stempelstand und das Ziel der Karte</li>
          <li>der Zeitpunkt jeder Stempelbuchung und jeder Einlösung</li>
          <li>der Zeitpunkt, an dem die Karte ausgegeben wurde</li>
          <li>
            technische Kennungen, damit sich die Karte in Apple Wallet oder Google Wallet
            aktualisieren kann
          </li>
        </ul>
        <p className="mt-3">
          <strong className="font-medium text-ink">
            Ihr Name, Ihre E-Mail-Adresse und Ihre Telefonnummer werden nicht erhoben.
          </strong>{' '}
          Beim Scannen wird nichts abgefragt. Aus den Zeitpunkten der Besuche lässt sich
          allerdings ablesen, wie oft Sie hier waren — deshalb behandeln wir sie als
          personenbezogene Daten.
        </p>
      </Section>

      <Section title="Wozu">
        <p>
          Ausschließlich, um die Stempelkarte zu führen: Stempel zu zählen, den Stand in
          Ihrem Wallet aktuell zu halten und die Belohnung einzulösen. Es findet keine
          Auswertung zu Werbezwecken und keine Weitergabe zu Werbezwecken statt.
        </p>
      </Section>

      <Section title="Wer die Daten außerdem erhält">
        <p>
          Die Karte liegt in Ihrem Wallet — je nach Gerät bei <strong className="font-medium text-ink">Apple</strong>{' '}
          oder <strong className="font-medium text-ink">Google</strong>. Diese erhalten den
          Namen des Betriebs, die Kartennummer und den Stempelstand, damit die Karte auf
          Ihrem Gerät angezeigt und aktualisiert werden kann.
        </p>
        <p>
          Gespeichert und verarbeitet werden die Daten auf Servern in{' '}
          <strong className="font-medium text-ink">Frankfurt am Main</strong> (Neon, Vercel).
        </p>
      </Section>

      <Section title="Wie lange">
        <p>
          Ihre Karte und ihr Stempelstand bleiben, solange Sie die Karte nutzen. Die
          Angaben dazu, <em>wann</em> einzelne Stempel gebucht wurden, werden nach{' '}
          {stampEventDays} Tagen automatisch gelöscht — der Stempelstand bleibt dabei
          erhalten.
        </p>
        <p>
          Löschen Sie die Karte aus Ihrem Wallet oder bitten Sie den Betrieb um Löschung,
          werden alle Daten zu Ihrer Karte entfernt.
        </p>
      </Section>

      <Section title="Ihre Rechte">
        <p>
          Sie können Auskunft über die zu Ihrer Karte gespeicherten Daten verlangen, deren
          Berichtigung oder Löschung, sowie der Verarbeitung widersprechen. Nennen Sie dabei
          die Nummer Ihrer Karte — ohne sie lässt sich die Karte nicht zuordnen, weil zu ihr
          kein Name gespeichert ist. Außerdem können Sie sich bei einer
          Datenschutz-Aufsichtsbehörde beschweren.
        </p>
      </Section>

      <p className="pt-2 text-[12px] text-ink-3">
        <Link href={`/k/${code}`} className="underline underline-offset-2 hover:text-ink">
          Zurück zur Karte
        </Link>
      </p>
    </Shell>
  )
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-dvh max-w-md px-6 py-10">
      <h1 className="text-[20px] font-semibold text-ink">{title}</h1>
      <div className="mt-4 space-y-6">{children}</div>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5 text-[13.5px] leading-relaxed text-ink-2">
      <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
      {children}
    </section>
  )
}
