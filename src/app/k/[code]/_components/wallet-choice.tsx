'use client'

import * as React from 'react'
import Link from 'next/link'
import { AppleWalletButton, GoogleWalletButton } from '@/components/wallet-badges'
import { CONSENT_PARAM, CONSENT_TEXT } from '@/lib/privacy/consent'

/**
 * Die Wallet-Knöpfe samt Einwilligung.
 *
 * Das Häkchen sitzt *über* den Knöpfen und ist leer voreingestellt: eine vorangekreuzte
 * Zustimmung ist keine. Es hängt an nichts weiter — wer nichts ankreuzt, bekommt seine
 * Karte trotzdem, nur eben keine Werbung. Die Karte gegen die Einwilligung zu tauschen
 * wäre eine Kopplung, die die Einwilligung wertlos machte.
 *
 * Übergeben wird sie als Parameter am Ausgabe-Link, weil der Pass ohnehin erst dort
 * entsteht. Vorher wird nichts gespeichert, auch nicht das Häkchen.
 */
export function WalletChoice({ code, platform }: { code: string; platform: string | null }) {
  const [consent, setConsent] = React.useState(false)

  const href = (p: 'apple' | 'google') =>
    `/api/k/${code}?p=${p}${consent ? `&${CONSENT_PARAM}=1` : ''}`

  const apple = (
    <AppleWalletButton key="apple" href={href('apple')} size="lg" className="justify-center" />
  )
  const google = (
    <GoogleWalletButton key="google" href={href('google')} size="lg" className="justify-center" />
  )

  const buttons = platform === 'apple' ? [apple] : platform === 'google' ? [google] : [apple, google]

  return (
    <div className="flex flex-col items-center gap-4">
      <label className="flex max-w-sm cursor-pointer items-start gap-2.5 text-left text-[12.5px] leading-snug text-ink-2">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-accent"
        />
        <span>{CONSENT_TEXT}</span>
      </label>

      <div className="flex w-full flex-col items-center gap-3">{buttons}</div>

      <p className="text-center text-[12px] text-ink-3">
        <Link
          href={`/k/${code}/datenschutz`}
          className="underline underline-offset-2 hover:text-ink"
        >
          Datenschutzhinweise
        </Link>
      </p>
    </div>
  )
}
