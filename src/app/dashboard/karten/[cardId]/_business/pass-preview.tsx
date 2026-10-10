'use client'

import * as React from 'react'
import QRCode from 'qrcode'
import { cn } from '@/lib/utils'
import type { DraftCompany, DraftContact, DraftDesign } from './editor-state'

/**
 * Live-Vorschau der Visitenkarte, wie sie im Wallet liegt — nachgebaut nach dem, was
 * `apple-pass-json.ts` und `google-generic.ts` ausliefern:
 *
 *   Apple, Aussteller  Banner (Name groß, Foto unten rechts), eine Zeile Felder, QR-Code
 *   Apple, Empfänger   Name mit Foto daneben, zwei Zeilen Kontaktdaten, Ort oben — kein Code
 *   Google             Titel, Name, Position; QR-Code nur beim Aussteller
 *
 * Eine Annäherung, kein Screenshot — Schriftgrößen und Abstände setzt Wallet selbst.
 */

export type PreviewPlatform = 'apple' | 'google'
export type PreviewRole = 'OWNER' | 'HOLDER'

function blank(value: string): string | null {
  const t = value.trim()
  return t === '' ? null : t
}

function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '')
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

interface PreviewData {
  name: string
  jobTitle: string | null
  phone: string | null
  mobile: string | null
  email: string | null
  firm: string | null
  city: string | null
  website: string | null
  title: string
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
  const firm = blank(company.company)
  const data: PreviewData = {
    name,
    jobTitle: contact ? blank(contact.jobTitle) : 'Position',
    phone: contact ? blank(contact.phone) : '+49 …',
    mobile: contact ? blank(contact.mobile) : null,
    email: contact ? blank(contact.email) : 'name@firma.de',
    firm,
    city: blank(company.city),
    website: blank(company.website),
    title: blank(design.cardTitle) ?? firm ?? name,
  }
  const companyPhone = blank(company.phone)
  const qr = useQr(role === 'OWNER' ? (scanUrl ?? 'https://stampie.de/v/…') : null)
  const photo = contact?.photoUrl ?? null

  if (platform === 'google') return <GooglePreview design={design} data={data} qr={qr} />
  if (role === 'OWNER') return <AppleOwnerPreview design={design} data={data} qr={qr} photo={photo} companyPhone={companyPhone} />
  return <AppleHolderPreview design={design} data={data} photo={photo} companyPhone={companyPhone} />
}

function Field({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[8.5px] font-semibold uppercase tracking-wide" style={{ color }}>
        {label}
      </p>
      <p className="truncate text-[11.5px]">{value}</p>
    </div>
  )
}

function fields(entries: Array<[string, string | null]>): Array<[string, string]> {
  return entries.filter((e): e is [string, string] => Boolean(e[1]))
}

function AppleShell({ design, children }: { design: DraftDesign; children: React.ReactNode }) {
  return (
    <div
      className="mx-auto flex aspect-[320/420] w-full max-w-[300px] flex-col overflow-hidden rounded-[14px] shadow-lg"
      style={{ backgroundColor: design.backgroundColor, color: design.foregroundColor }}
    >
      {children}
    </div>
  )
}

function AppleHeader({ design, title, right }: { design: DraftDesign; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 px-3">
      {design.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={design.logoUrl} alt="" className="h-5 w-auto max-w-[70px] object-contain" />
      ) : null}
      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{title}</span>
      {right}
    </div>
  )
}

function AppleOwnerPreview({
  design,
  data,
  qr,
  photo,
  companyPhone,
}: {
  design: DraftDesign
  data: PreviewData
  qr: string | null
  photo: string | null
  companyPhone: string | null
}) {
  const fg = design.foregroundColor
  return (
    <AppleShell design={design}>
      <AppleHeader design={design} title={data.title} />
      {/* Banner wie `render-strip.ts` (375×144): Name oben links, Foto unten rechts. */}
      <div
        className="relative aspect-[375/144] w-full shrink-0 overflow-hidden px-3 pt-[3%]"
        style={{ backgroundImage: `linear-gradient(135deg, ${fg}1a, ${fg}00)` }}
      >
        <p className="relative z-10 truncate text-[29px] font-light leading-tight">{data.name}</p>
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt=""
            className="absolute bottom-[7%] right-[4.5%] aspect-square h-[50%] rounded-full object-cover"
            style={{ boxShadow: `0 0 0 2px ${fg}59` }}
          />
        ) : null}
      </div>
      <div className="grid shrink-0 grid-cols-3 gap-2 px-3 pt-2.5">
        {fields([
          ['Position', data.jobTitle],
          ['Telefon', data.mobile ?? data.phone ?? companyPhone],
          ['E-Mail', data.email],
        ]).map(([l, v]) => (
          <Field key={l} label={l} value={v} color={design.labelColor} />
        ))}
      </div>
      <div className="flex flex-1 flex-col items-center justify-end gap-1 pb-3">
        {qr ? (
          <div className="rounded-lg bg-white p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="" className="size-[104px]" />
          </div>
        ) : null}
        <span className="text-[10px] opacity-80">Scannen für meine Visitenkarte</span>
      </div>
    </AppleShell>
  )
}

function AppleHolderPreview({
  design,
  data,
  photo,
  companyPhone,
}: {
  design: DraftDesign
  data: PreviewData
  photo: string | null
  companyPhone: string | null
}) {
  const label = design.labelColor
  return (
    <AppleShell design={design}>
      <AppleHeader
        design={design}
        title={data.title}
        right={data.city ? <Field label="Ort" value={data.city} color={label} /> : null}
      />
      {/* Generic: Name links, Foto rechts daneben — nichts überlappt. */}
      <div className="flex shrink-0 items-center gap-3 px-3 pt-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: label }}>
            {data.jobTitle ?? 'Visitenkarte'}
          </p>
          <p className="text-[26px] font-light leading-tight">{data.name}</p>
        </div>
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="size-[72px] shrink-0 rounded-md object-cover" />
        ) : null}
      </div>
      <div className="grid shrink-0 grid-cols-3 gap-2 px-3 pt-5">
        {fields([
          ['Firma', data.firm],
          ['Telefon', data.phone ?? companyPhone],
          ['Mobil', data.mobile],
        ]).map(([l, v]) => (
          <Field key={l} label={l} value={v} color={label} />
        ))}
      </div>
      <div className="grid shrink-0 grid-cols-2 gap-2 px-3 pt-3">
        {fields([
          ['E-Mail', data.email],
          ['Web', data.website ? displayUrl(data.website) : null],
        ]).map(([l, v]) => (
          <Field key={l} label={l} value={v} color={label} />
        ))}
      </div>
      <div className="flex-1" />
    </AppleShell>
  )
}

function GooglePreview({ design, data, qr }: { design: DraftDesign; data: PreviewData; qr: string | null }) {
  return (
    <div
      className="mx-auto w-full max-w-[300px] overflow-hidden rounded-[22px] shadow-lg"
      style={{ backgroundColor: design.backgroundColor, color: design.foregroundColor }}
    >
      <div className="flex items-center gap-2.5 px-4 pt-4">
        <span className={cn('flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/15')}>
          {design.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={design.logoUrl} alt="" className="h-[70%] w-[70%] object-contain" />
          ) : null}
        </span>
        <span className="truncate text-[13px] font-medium opacity-90">{data.title}</span>
      </div>
      <div className="px-4 pb-4 pt-5">
        <p className="text-[22px] font-medium leading-tight">{data.name}</p>
        {data.jobTitle ? <p className="mt-0.5 text-[13px] opacity-80">{data.jobTitle}</p> : null}
      </div>
      {qr ? (
        <div className="flex flex-col items-center gap-1.5 px-4 pb-5">
          <div className="rounded-xl bg-white p-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="" className="size-[130px]" />
          </div>
          <span className="text-[11px] opacity-80">Scannen für meine Visitenkarte</span>
        </div>
      ) : null}
    </div>
  )
}
