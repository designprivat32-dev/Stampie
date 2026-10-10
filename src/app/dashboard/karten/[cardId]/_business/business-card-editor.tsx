'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { Badge, Spinner } from '@/components/ui/misc'
import { saveBusinessDesignAction } from '@/actions/business-cards'
import { uploadAssetAction } from '@/actions/assets'
import type { BusinessEditorData } from '@/lib/business-cards/editor-service'
import { CompanySection } from './company-section'
import { ContactsSection } from './contacts-section'
import { EditorSection } from './editor-section'

/**
 * Der Editor einer Visitenkarte: Aussehen, Firmendaten, Personen.
 *
 * Bewusst schlicht gegenüber dem Stempel-Designer — eine Visitenkarte hat keine Stempel,
 * keine Rückseiten-Felder und keine Standorte. Gespeichert wird abschnittsweise, und das
 * Aussehen wird beim Speichern gleich veröffentlicht.
 */
export function BusinessCardEditor({ data }: { data: BusinessEditorData }) {
  const ready = data.publishedVersion !== null && data.company !== null && data.contacts.length > 0

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <div className="space-y-1">
        <Link
          href="/dashboard/karten"
          className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink"
        >
          <ArrowLeft className="size-3.5" />
          Alle Karten
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[17px] font-semibold text-ink">{data.cardName}</h1>
          <Badge tone="accent">Visitenkarte</Badge>
          {data.publishedVersion !== null ? (
            <Badge tone="ok">v{data.publishedVersion}</Badge>
          ) : (
            <Badge tone="neutral">Noch nicht veröffentlicht</Badge>
          )}
        </div>
        <p className="text-[12.5px] text-ink-3">{data.orgName ?? 'Keinem Kunden zugewiesen'}</p>
      </div>

      {!ready ? <Checklist data={data} /> : null}

      <DesignSection data={data} />
      <CompanySection cardId={data.cardId} company={data.company} />
      <ContactsSection
        cardId={data.cardId}
        contacts={data.contacts}
        published={data.publishedVersion !== null}
      />
    </div>
  )
}

/** Was noch fehlt, bis jemand die Karte scannen kann — in der Reihenfolge, in der es nötig ist. */
function Checklist({ data }: { data: BusinessEditorData }) {
  const steps = [
    { done: data.publishedVersion !== null, label: 'Aussehen speichern (veröffentlicht die Karte)' },
    { done: data.company !== null, label: 'Firmendaten eintragen' },
    { done: data.contacts.length > 0, label: 'Mindestens eine Person anlegen' },
  ]
  return (
    <div className="rounded-xl border border-line bg-surface-2 px-4 py-3">
      <p className="text-[13px] font-medium text-ink">Bis zur ersten Visitenkarte im Wallet</p>
      <ol className="mt-2 space-y-1 text-[12.5px] text-ink-2">
        {steps.map((step) => (
          <li key={step.label} className={step.done ? 'text-ink-3 line-through' : undefined}>
            {step.done ? '✓' : '○'} {step.label}
          </li>
        ))}
      </ol>
    </div>
  )
}

function DesignSection({ data }: { data: BusinessEditorData }) {
  const router = useRouter()
  const [design, setDesign] = React.useState(data.design)
  const [busy, setBusy] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const [message, setMessage] = React.useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)

  const set = (patch: Partial<typeof design>) => setDesign((d) => ({ ...d, ...patch }))

  const upload = async (file: File) => {
    setUploading(true)
    setMessage(null)
    try {
      const form = new FormData()
      form.set('cardId', data.cardId)
      form.set('kind', 'LOGO')
      form.set('file', file)
      const result = await uploadAssetAction(form)
      if (!result.success) {
        setMessage({ tone: 'error', text: result.error.message })
        return
      }
      set({ logoAssetId: result.data.id, logoUrl: result.data.url })
    } finally {
      setUploading(false)
    }
  }

  const save = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const result = await saveBusinessDesignAction({
        cardId: data.cardId,
        backgroundColor: design.backgroundColor,
        foregroundColor: design.foregroundColor,
        labelColor: design.labelColor,
        cardTitle: design.cardTitle.trim() || null,
        logoAssetId: design.logoAssetId,
      })
      if (!result.success) {
        setMessage({ tone: 'error', text: result.error.message })
        return
      }
      setMessage({ tone: 'ok', text: `Gespeichert und veröffentlicht (v${result.data.version}).` })
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  const firstName = data.contacts[0]
    ? `${data.contacts[0].contact.firstName} ${data.contacts[0].contact.lastName}`
    : 'Vorname Nachname'

  return (
    <EditorSection title="Aussehen" description="Farben und Logo der Karte im Wallet.">
      <div className="grid gap-5 sm:grid-cols-[1fr_220px]">
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <ColorField label="Hintergrund" value={design.backgroundColor} onChange={(v) => set({ backgroundColor: v })} />
            <ColorField label="Schrift" value={design.foregroundColor} onChange={(v) => set({ foregroundColor: v })} />
            <ColorField label="Beschriftung" value={design.labelColor} onChange={(v) => set({ labelColor: v })} />
          </div>

          <Field label="Titel oben auf der Karte" htmlFor="bc-title" hint="Leer lassen, dann steht dort der Firmenname.">
            <Input
              id="bc-title"
              value={design.cardTitle}
              maxLength={40}
              onChange={(e) => set({ cardTitle: e.target.value })}
            />
          </Field>

          <div className="flex items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void upload(file)
                e.target.value = ''
              }}
            />
            <Button variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? <Spinner /> : <Upload />}
              {design.logoAssetId ? 'Logo ersetzen' : 'Logo hochladen'}
            </Button>
            {design.logoAssetId ? (
              <Button variant="ghost" size="sm" onClick={() => set({ logoAssetId: null, logoUrl: null })}>
                Logo entfernen
              </Button>
            ) : null}
          </div>
        </div>

        {/* Vereinfachte Vorschau; was Wallet tatsächlich zeichnet, zeigt der Pass selbst. */}
        <div
          className="flex flex-col gap-3 rounded-2xl p-4 shadow-sm"
          style={{ backgroundColor: design.backgroundColor, color: design.foregroundColor }}
        >
          <div className="flex items-center gap-2">
            {design.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={design.logoUrl} alt="" className="h-6 w-auto max-w-[90px] object-contain" />
            ) : null}
            <span className="truncate text-[12px] font-semibold">
              {design.cardTitle.trim() || data.company?.company || 'Firma'}
            </span>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide" style={{ color: design.labelColor }}>
              Visitenkarte
            </p>
            <p className="text-[17px] font-semibold leading-tight">{firstName}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Button variant="primary" disabled={busy} onClick={() => void save()}>
          {busy ? <Spinner /> : null}
          Speichern und veröffentlichen
        </Button>
        {message ? (
          <p className={message.tone === 'ok' ? 'text-[12.5px] text-ok' : 'text-[12.5px] text-danger'}>
            {message.text}
          </p>
        ) : null}
      </div>
    </EditorSection>
  )
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="space-y-1.5 text-[12.5px] font-medium text-ink">
      <span>{label}</span>
      <span className="flex items-center gap-2 rounded-md border border-line bg-surface px-2 py-1.5">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="size-6 cursor-pointer rounded border-0 bg-transparent p-0"
        />
        <span className="font-mono text-[12px] text-ink-2">{value}</span>
      </span>
    </label>
  )
}
