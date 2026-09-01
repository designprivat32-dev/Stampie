'use client'

import * as React from 'react'
import { withdrawMarketingConsentAction } from '@/actions/consent'

/**
 * Der Widerruf, dort wo der Kunde ohnehin landet: hinter dem Strichcode seiner Karte.
 *
 * Ein Satz und ein Knopf. Wer widerrufen will, soll nicht suchen müssen — und ein
 * Widerruf, der umständlicher ist als das Häkchen bei der Ausgabe, macht die Einwilligung
 * angreifbar.
 */
export function ConsentWithdraw({ serial }: { serial: string }) {
  const [done, setDone] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  if (done) {
    return (
      <p role="status" className="mt-5 text-[12.5px] leading-snug text-ink-3">
        Du bekommst keine Nachrichten mehr zu dieser Karte. Der Stempelstand bleibt
        selbstverständlich erhalten.
      </p>
    )
  }

  return (
    <div className="mt-5 border-t border-line pt-4">
      <p className="text-[12.5px] leading-snug text-ink-3">
        Du erhältst Nachrichten zu Angeboten dieses Betriebs.
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const result = await withdrawMarketingConsentAction(serial)
            if (result.success) setDone(true)
            else setError(result.error.message)
          })
        }
        className="mt-1 text-[12.5px] text-ink-2 underline underline-offset-2 transition-colors hover:text-ink disabled:opacity-50"
      >
        {pending ? 'Wird gespeichert…' : 'Keine Nachrichten mehr erhalten'}
      </button>
      {error ? (
        <p role="alert" className="mt-1 text-[12px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}
