import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Support — stampie',
  description: 'Hilfe und Kontakt für Nutzerinnen und Nutzer von stampie.',
}

const KONTAKT = 'gabarkiewiczkajetan@gmail.com'

/** Öffentliche Hilfeseite. Ohne Anmeldung erreichbar — die App verlinkt hierher. */
export default function SupportPage() {
  return (
    <article className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Support</h1>
        <p className="text-sm text-ink/70">Hilfe und Kontakt rund um stampie</p>
      </header>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Was stampie ist</h2>
        <p className="leading-relaxed">
          stampie ist eine Anwendung für Betriebe. Damit werden digitale Stempelkarten
          gestaltet, ausgegeben und beim Besuch gestempelt. Sie richtet sich an die
          Mitarbeitenden des jeweiligen Betriebs, nicht an dessen Kundschaft.
        </p>
        <p className="leading-relaxed">
          Zugänge werden nicht hier vergeben, sondern vom jeweiligen Betrieb. Wenn du in
          einem Café, Friseursalon oder einem anderen Geschäft mit stampie arbeitest und
          keinen Zugang hast, wende dich bitte zuerst an die dortige Leitung.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Kontakt</h2>
        <p className="leading-relaxed">
          <a
            className="underline underline-offset-4 hover:no-underline"
            href={`mailto:${KONTAKT}`}
          >
            {KONTAKT}
          </a>
        </p>
        <p className="text-sm leading-relaxed text-ink/70">
          Wir antworten auf Deutsch und Englisch. Bitte schreibe dazu, um welchen Betrieb es
          geht und was du gerade versucht hast — das erspart eine Rückfrage.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Wohin womit</h2>
        <dl className="space-y-4">
          <div className="space-y-1">
            <dt className="font-medium">Technische Störungen</dt>
            <dd className="leading-relaxed text-ink/80">
              Etwas lädt nicht, der QR-Scan bricht ab, ein Stempel wird nicht gebucht: an die
              Adresse oben, mit Gerät, Browser und ungefährer Uhrzeit.
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="font-medium">Verlorene oder gesperrte Zugänge</dt>
            <dd className="leading-relaxed text-ink/80">
              Zuerst an die Leitung deines Betriebs — dort werden Zugänge verwaltet. Kommt ihr
              gemeinsam nicht weiter, meldet euch bei uns.
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="font-medium">Datenschutz, Auskunft und Löschung</dt>
            <dd className="leading-relaxed text-ink/80">
              Anfragen nach Art. 15 bis 21 DSGVO gehen an dieselbe Adresse. Bitte im Betreff
              „Datenschutz“ angeben, damit sie nicht im übrigen Support untergeht.
            </dd>
          </div>
        </dl>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Rechtliches</h2>
        <p className="leading-relaxed">
          <a className="underline underline-offset-4 hover:no-underline" href="/impressum">
            Impressum
          </a>
        </p>
      </section>

      <p className="text-sm text-ink/60">Stand: August 2026</p>
    </article>
  )
}
