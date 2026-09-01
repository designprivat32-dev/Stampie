import Link from 'next/link'
import { readProcessor } from '@/lib/legal/processor'
import { readRetentionPolicy } from '@/lib/privacy/retention'

/**
 * Die Datenschutzinformation zur Stempelkarte.
 *
 * Erreichbar auf zwei Wegen, weil es zwei Zeitpunkte gibt: über den Ausgabe-Code, bevor
 * jemand die Karte nimmt, und über die Seriennummer, wenn er sie schon hat. Derselbe Text
 * an beiden Stellen — eine zweite Fassung würde irgendwann auseinanderlaufen.
 *
 * Verantwortlich ist der Betrieb, er entscheidet über die Karte. Dieses Unternehmen
 * verarbeitet in seinem Auftrag. Beide stehen deshalb hier mit Anschrift.
 *
 * Nicht zu verwechseln mit der Datenschutzerklärung des Betriebs auf dessen eigener
 * Website: die gehört ihm und deckt sein ganzes Geschäft ab. Diese Seite deckt genau das
 * ab, was die Karte speichert — und das weiß seine Erklärung nicht.
 *
 * Der Text beschreibt ausschließlich, was das System tatsächlich speichert. Wird das
 * Schema erweitert, gehört diese Seite mit angepasst.
 */
export interface PrivacyNoticeShop {
  organizationName: string
  street: string | null
  postalCode: string | null
  city: string | null
  phone: string | null
  email: string | null
}

export function PrivacyNotice({ shop, backHref }: { shop: PrivacyNoticeShop; backHref: string }) {
  const address = [shop.street, [shop.postalCode, shop.city].filter(Boolean).join(' ')]
    .filter((part) => part && part.trim().length > 0)
    .join(', ')

  // Ohne hinterlegte Stammdaten hat der Betrieb hier keine Anlaufstelle. Dann darf der
  // Text nicht auf eine Adresse verweisen, die gar nicht dasteht.
  const hasContact = Boolean(address || shop.phone || shop.email)

  const { processor, missing } = readProcessor()
  // Die genannte Frist ist die, die der Aufräum-Lauf tatsächlich anwendet — keine Zahl,
  // die hier steht und sonst nirgends gilt.
  const { stampEventDays } = readRetentionPolicy()

  return (
    <PrivacyShell title="Datenschutz">
      <p className="text-[13px] text-ink-3">
        Informationen zur digitalen Stempelkarte von {shop.organizationName}.
      </p>

      <Section title="Wer für Ihre Daten verantwortlich ist">
        <p>
          <strong className="font-medium text-ink">{shop.organizationName}</strong>
          {address ? <>, {address}</> : null}
        </p>
        {shop.phone ? <p>Telefon: {shop.phone}</p> : null}
        {shop.email ? <p>E-Mail: {shop.email}</p> : null}
        <p>
          {hasContact
            ? 'An diese Adresse richten Sie Auskunfts- und Löschanfragen zu Ihrer Stempelkarte.'
            : 'Für Auskunft oder Löschung wenden Sie sich bitte direkt an den Betrieb.'}
        </p>
      </Section>

      <Section title="Wer die Karte technisch betreibt">
        {processor ? (
          <p>
            Im Auftrag des Betriebs:{' '}
            <strong className="font-medium text-ink">{processor.name}</strong>, {processor.address},{' '}
            {processor.email}. Der Betrieb bleibt verantwortlich; der Betreiber verarbeitet
            ausschließlich weisungsgebunden.
          </p>
        ) : (
          // Lieber sichtbar unvollständig als still falsch: eine Datenschutzinformation
          // ohne den Auftragsverarbeiter erfüllt ihren Zweck nicht.
          <p className="text-danger">Angaben zum Auftragsverarbeiter fehlen ({missing.join(', ')}).</p>
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
          <li>ob Sie in Nachrichten eingewilligt haben, und der Wortlaut dieser Einwilligung</li>
          <li>
            falls Sie der Wiedererkennung zugestimmt haben: eine zufällige Kennung, die Ihr
            Gerät speichert — samt Wortlaut dieser Zustimmung
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

      <Section title="Wiedererkennung Ihres Geräts">
        <p>
          Nur wenn Sie beim Hinzufügen der Karte ausdrücklich zugestimmt haben, legt Ihr
          Browser eine zufällige Kennung ab. Scannen Sie später erneut, bekommen Sie damit{" "}
          <strong className="font-medium text-ink">Ihre bestehende Karte</strong> zurück statt
          einer neuen, leeren — ohne die Kennung landen Ihre Stempel auf zwei Karten.
        </p>
        <p>
          Der Betrieb sieht dadurch außerdem, wie viele Personen seine Karten nutzen, statt
          nur wie viele Karten ausgegeben wurden. Die Kennung enthält keine Angaben über Sie
          und wird nur für dieses eine Kartenprogramm verwendet.
        </p>
        <p>
          Sie können sie jederzeit entfernen, indem Sie die Websitedaten in Ihrem Browser
          löschen. Ohne Zustimmung wird nichts auf Ihrem Gerät gespeichert.
        </p>
      </Section>

      <Section title="Wozu">
        <p>
          Ausschließlich, um die Stempelkarte zu führen: Stempel zu zählen, den Stand in Ihrem
          Wallet aktuell zu halten und die Belohnung einzulösen.
        </p>
        <p>
          Nachrichten zu Angeboten erhalten Sie nur, wenn Sie beim Hinzufügen der Karte
          ausdrücklich zugestimmt haben. Diese Zustimmung können Sie jederzeit widerrufen — der
          Link dazu steht auf der Rückseite Ihrer Karte.
        </p>
      </Section>

      <Section title="Wer die Daten außerdem erhält">
        <p>
          Die Karte liegt in Ihrem Wallet — je nach Gerät bei{' '}
          <strong className="font-medium text-ink">Apple</strong> oder{' '}
          <strong className="font-medium text-ink">Google</strong>. Diese erhalten den Namen des
          Betriebs, die Kartennummer und den Stempelstand, damit die Karte auf Ihrem Gerät
          angezeigt und aktualisiert werden kann.
        </p>
        <p>
          Gespeichert und verarbeitet werden die Daten auf Servern in{' '}
          <strong className="font-medium text-ink">Frankfurt am Main</strong> (Neon, Vercel).
        </p>
      </Section>

      <Section title="Wie lange">
        <p>
          Ihre Karte und ihr Stempelstand bleiben, solange Sie die Karte nutzen. Die Angaben
          dazu, <em>wann</em> einzelne Stempel gebucht wurden, werden nach {stampEventDays} Tagen
          automatisch gelöscht — der Stempelstand bleibt dabei erhalten.
        </p>
        <p>
          Löschen Sie die Karte aus Ihrem Wallet oder bitten Sie den Betrieb um Löschung, werden
          alle Daten zu Ihrer Karte entfernt.
        </p>
      </Section>

      <Section title="Ihre Rechte">
        <p>
          Sie können Auskunft über die zu Ihrer Karte gespeicherten Daten verlangen, deren
          Berichtigung oder Löschung, sowie der Verarbeitung widersprechen. Nennen Sie dabei die
          Nummer Ihrer Karte — ohne sie lässt sich die Karte nicht zuordnen, weil zu ihr kein Name
          gespeichert ist. Außerdem können Sie sich bei einer Datenschutz-Aufsichtsbehörde
          beschweren.
        </p>
      </Section>

      <p className="pt-2 text-[12px] text-ink-3">
        <Link href={backHref} className="underline underline-offset-2 hover:text-ink">
          Zurück zur Karte
        </Link>
      </p>
    </PrivacyShell>
  )
}

export function PrivacyShell({ title, children }: { title: string; children: React.ReactNode }) {
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
