'use client'

import * as React from 'react'
import QRCode from 'qrcode'
import { buildCompactVCard } from '@/lib/business-cards/vcard'
import { cn } from '@/lib/utils'
import type { DraftCompany, DraftContact, DraftDesign } from './editor-state'

/**
 * Live-Vorschau der Visitenkarte, wie sie im Wallet liegt — Apple oder Google, Aussteller
 * oder Empfänger. Nachgebaut nach dem, was `apple-pass-json.ts` und `google-generic.ts`
 * tatsächlich ausliefern: Banner mit Foto und Name, die Zeile darunter, unten der Code.
 *
 * Eine Annäherung, kein Screenshot — Schriftgrößen und Abstände setzt Wallet selbst.
 */

export type PreviewPlatform = 'apple' | 'google'
export type PreviewRole = 'OWNER' | 'HOLDER'

function blank(value: string): string | null {
  const t = value.trim()
  return t === '' ? null : t
}

function useQr(value: string | null): string | null {
  const [url, setUrl] = React.useState<string | null>(null)
  React.useEffect(() => {
    let alive = true
    if (!value) {
      setUrl(null)
      return
    }
    QRCode.toDataURL(value, { errorCorrectionLevel: 'M', margin: 0, width: 240 })
      .then((data) => alive && setUrl(data))
      .catch(() => alive && setUrl(null))
    return () => {
      alive = false
    }
  }, [value])
  return url
}

export function PassPreview({
  design,
  company,
  contact,
  scanUrl,
  platform,
  role,
}: {
  design: DraftDesign
  company: DraftCompany
  contact: DraftContact | null
  /** Ziel des Aussteller-Codes; bei neuen Personen erst nach dem Speichern bekannt. */
  scanUrl: string | null
  platform: PreviewPlatform
  role: PreviewRole
}) {
  const name = contact ? `${contact.firstName} ${contact.lastName}`.trim() || 'Vorname Nachname' : 'Vorname Nachname'
  const jobTitle = contact ? blank(contact.jobTitle) : 'Position'
  const phone = contact ? (blank(contact.mobile) ?? blank(contact.phone) ?? blank(company.phone)) : '+49 …'
  const email = contact ? blank(contact.email) : 'name@firma.de'
  const firm = blank(company.company)
  const title = blank(design.cardTitle) ?? firm ?? name

  const vcard = React.useMemo(() => {
    if (!contact) return null
    return buildCompactVCard({
      contact: {
        firstName: contact.firstName || 'Vorname',
        lastName: contact.lastName || 'Nachname',
        jobTitle: blank(contact.jobTitle),
        phone: blank(contact.phone),
        mobile: blank(contact.mobile),
        email: blank(contact.email),
        links: [],
      },
      company: firm
        ? { company: firm, website: blank(company.website), phone: blank(company.phone), street: null, postalCode: null, city: null }
        : null,
    })
  }, [contact, firm, company.website, company.phone])

  const codeValue = role === 'OWNER' ? (scanUrl ?? 'https://stampie.de/v/…') : vcard
  const showCode = platform === 'apple' || role === 'OWNER'
  const qr = useQr(showCode ? codeValue : null)
  const caption = role === 'OWNER' ? 'Scannen für meine Visitenkarte' : 'Scannen, um den Kontakt zu speichern'

  const fg = design.foregroundColor
  const label = design.labelColor

  if (platform === 'google') {
    return (
      <div className="mx-auto w-full max-w-[300px] overflow-hidden rounded-[22px] shadow-lg" style={{ backgroundColor: design.backgroundColor, color: fg }}>
        <div className="flex items-center gap-2.5 px-4 pt-4">
          <Mark design={design} size={28} round />
          <span className="truncate text-[13px] font-medium opacity-90">{title}</span>
        </div>
        <div className="px-4 pb-4 pt-5">
          <p className="text-[22px] font-medium leading-tight">{name}</p>
          {jobTitle ? <p className="mt-0.5 text-[13px] opacity-80">{jobTitle}</p> : null}
        </div>
        {showCode && qr ? (
          <div className="flex flex-col items-center gap-1.5 px-4 pb-5">
            <div className="rounded-xl bg-white p-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="" className="size-[130px]" />
            </div>
            <span className="text-[11px] opacity-80">{caption}</span>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div
      className="mx-auto flex aspect-[320/420] w-full max-w-[300px] flex-col overflow-hidden rounded-[14px] shadow-lg"
      style={{ backgroundColor: design.backgroundColor, color: fg }}
    >
      <div className="flex h-11 shrink-0 items-center gap-2 px-3">
        {design.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={design.logoUrl} alt="" className="h-5 w-auto max-w-[70px] object-contain" />
        ) : null}
        <span className="truncate text-[13px] font-semibold">{title}</span>
      </div>

      {/* Banner wie `render-strip.ts`: Kartenfarbe mit leichtem Verlauf, Foto rund rechts. */}
      <div
        className="relative flex aspect-[375/123] w-full shrink-0 items-end px-3 pb-2"
        style={{ backgroundImage: `linear-gradient(135deg, ${fg}1a, ${fg}00)` }}
      >
        <p className="relative z-10 max-w-[62%] text-[22px] font-light leading-tight">{name}</p>
        {contact?.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={contact.photoUrl}
            alt=""
            className="absolute right-[5%] top-[10%] aspect-square h-[80%] rounded-full object-cover"
            style={{ boxShadow: `0 0 0 2px ${fg}59` }}
          />
        ) : null}
      </div>

      <div className="grid shrink-0 grid-cols-3 gap-2 px-3 pt-2.5">
        {[
          ['Position', jobTitle],
          ['Telefon', phone],
          ['E-Mail', email],
        ]
          .filter((entry): entry is [string, string] => Boolean(entry[1]))
          .map(([l, v]) => (
            <div key={l} className="min-w-0">
              <p className="text-[8.5px] font-semibold uppercase tracking-wide" style={{ color: label }}>
                {l}
              </p>
              <p className="truncate text-[11.5px]">{v}</p>
            </div>
          ))}
      </div>

      <div className="flex flex-1 flex-col items-center justify-end gap-1 pb-3">
        {qr ? (
          <div className="rounded-lg bg-white p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="" className="size-[104px]" />
          </div>
        ) : null}
        <span className="text-[10px] opacity-80">{caption}</span>
      </div>
    </div>
  )
}

function Mark({ design, size, round }: { design: DraftDesign; size: number; round?: boolean }) {
  return (
    <span
      className={cn('flex shrink-0 items-center justify-center overflow-hidden bg-white/15', round ? 'rounded-full' : 'rounded-md')}
      style={{ width: size, height: size }}
    >
      {design.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={design.logoUrl} alt="" className="h-[70%] w-[70%] object-contain" />
      ) : null}
    </span>
  )
}
