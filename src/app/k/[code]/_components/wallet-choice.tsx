'use client'

import * as React from 'react'
import Link from 'next/link'
import { AppleWalletButton, GoogleWalletButton } from '@/components/wallet-badges'
import {
  CONSENT_PARAM,
  CONSENT_TEXT,
  DEVICE_PARAM,
  RECOGNITION_TEXT,
} from '@/lib/privacy/consent'

/**
 * Die Wallet-Knöpfe samt der beiden Einwilligungen.
 *
 * Beide Häkchen sitzen *über* den Knöpfen und sind leer voreingestellt: eine vorangekreuzte
 * Zustimmung ist keine. Keines von beiden hängt an der Karte — wer nichts ankreuzt, bekommt
 * sie trotzdem. Die Karte gegen eine Einwilligung zu tauschen wäre eine Kopplung, die die
 * Einwilligung wertlos machte.
 *
 * Übergeben werden sie als Parameter am Ausgabe-Link, weil der Pass ohnehin erst dort
 * entsteht. Vorher wird nichts gespeichert.
 */
const storageKey = (code: string) => `stampie.dev.${code}`

/** 32 Byte aus dem Zufallsgenerator des Browsers, base64url — wer ihn hat, hat die Karte. */
function newDeviceKey(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function WalletChoice({
  code,
  platform,
  imprintUrl,
}: {
  code: string
  platform: string | null
  /** Impressum des Betriebs, falls hinterlegt. */
  imprintUrl: string | null
}) {
  const [consent, setConsent] = React.useState(false)
  const [deviceKey, setDeviceKey] = React.useState<string | null>(null)

  /*
   * Der Griff in den Speicher des Geräts passiert erst beim Ankreuzen — das Häkchen *ist*
   * die Einwilligung nach § 25 TDDDG. Solange es leer ist, wird nichts gelesen und nichts
   * abgelegt, auch nicht heimlich beim Laden der Seite.
   *
   * Schlägt der Zugriff fehl (privates Fenster, gesperrte Speicherung), bleibt es ohne
   * Wiedererkennung: der Server würfelt dann wie bisher einen Schlüssel, den niemand
   * wiederfindet. Das ist der alte Zustand, kein Fehler.
   */
  const toggleRecognition = (on: boolean) => {
    if (!on) {
      setDeviceKey(null)
      return
    }
    try {
      const existing = window.localStorage.getItem(storageKey(code))
      if (existing) {
        setDeviceKey(existing)
        return
      }
      const fresh = newDeviceKey()
      window.localStorage.setItem(storageKey(code), fresh)
      setDeviceKey(fresh)
    } catch {
      setDeviceKey(null)
    }
  }

  const href = (p: 'apple' | 'google') =>
    `/api/k/${code}?p=${p}` +
    (consent ? `&${CONSENT_PARAM}=1` : '') +
    (deviceKey ? `&${DEVICE_PARAM}=${deviceKey}` : '')

  const apple = (
    <AppleWalletButton key="apple" href={href('apple')} size="lg" className="justify-center" />
  )
  const google = (
    <GoogleWalletButton key="google" href={href('google')} size="lg" className="justify-center" />
  )

  const buttons = platform === 'apple' ? [apple] : platform === 'google' ? [google] : [apple, google]

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex w-full max-w-sm flex-col gap-2.5">
        <Choice checked={deviceKey !== null} onChange={toggleRecognition} label={RECOGNITION_TEXT} />
        <Choice checked={consent} onChange={setConsent} label={CONSENT_TEXT} />
      </div>

      <div className="flex w-full flex-col items-center gap-3">{buttons}</div>

      {/* Pflichtangaben unter den Knöpfen: die Seite ist ein geschäftliches Angebot, und
          der Kunde soll beides finden, bevor er die Karte nimmt. Das Impressum ist das des
          Betriebs — er betreibt das Kartenprogramm, nicht die Plattform. */}
      <p className="flex items-center justify-center gap-3 text-center text-[12px] text-ink-3">
        {imprintUrl ? (
          <>
            <a
              href={imprintUrl}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-ink"
            >
              Impressum
            </a>
            <span aria-hidden>·</span>
          </>
        ) : null}
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

function Choice({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-left text-[12.5px] leading-snug text-ink-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-accent"
      />
      <span>{label}</span>
    </label>
  )
}
