import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Impressum — stampie',
  description: 'Anbieterkennzeichnung nach § 5 DDG für stampie.',
}

/**
 * Anbieterkennzeichnung nach § 5 DDG.
 *
 * Angegeben ist die tatsächlich verantwortliche natürliche Person. Angaben, die
 * es nicht gibt, stehen bewusst nicht hier: keine Umsatzsteuer-Identifikations-
 * nummer, kein Registereintrag, keine Aufsichtsbehörde, keine berufsrechtlichen
 * Angaben — § 5 DDG verlangt sie nur, soweit sie vorliegen. Auch § 18 Abs. 2
 * MStV entfällt, weil hier keine journalistisch-redaktionellen Inhalte
 * angeboten werden.
 */
export default function ImpressumPage() {
  return (
    <article className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Impressum</h1>
        <p className="text-sm text-ink/70">Angaben gemäß § 5 DDG</p>
      </header>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Anbieter</h2>
        <p className="leading-relaxed">
          Kajetan Gabarkiewicz
          <br />
          Uhlhornsweg 99a
          <br />
          26129 Oldenburg
          <br />
          Deutschland
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Kontakt</h2>
        <p className="leading-relaxed">
          E-Mail:{' '}
          <a
            className="underline underline-offset-4 hover:no-underline"
            href="mailto:gabarkiewiczkajetan@gmail.com"
          >
            gabarkiewiczkajetan@gmail.com
          </a>
        </p>
        <p className="text-sm leading-relaxed text-ink/70">
          Anfragen zu stampie werden über diese Adresse beantwortet. Weitere Wege und
          Zuständigkeiten sind auf der{' '}
          <a className="underline underline-offset-4 hover:no-underline" href="/support">
            Support-Seite
          </a>{' '}
          beschrieben.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Umsatzsteuer</h2>
        <p className="leading-relaxed">
          Eine Umsatzsteuer-Identifikationsnummer nach § 27 a Umsatzsteuergesetz liegt nicht
          vor.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Verantwortlich für den Inhalt</h2>
        <p className="leading-relaxed">Kajetan Gabarkiewicz, Anschrift wie oben.</p>
      </section>

      <p className="text-sm text-ink/60">Stand: August 2026</p>
    </article>
  )
}
