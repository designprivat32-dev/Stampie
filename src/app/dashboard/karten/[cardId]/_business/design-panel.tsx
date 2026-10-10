'use client'

import * as React from 'react'
import { Check, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { Spinner } from '@/components/ui/misc'
import { uploadAssetAction } from '@/actions/assets'
import { ACCEPTED_UPLOAD_MIME } from '@/lib/images/upload-constraints'
import { cn } from '@/lib/utils'
import { COLOR_PRESETS, type DraftDesign } from './editor-state'
import { EditorSection } from './editor-section'

/** Aussehen der Karte: fertige Farbkombination oder eigene Farben, Titel, Logo. */
export function DesignPanel({
  cardId,
  design,
  onChange,
  errors,
}: {
  cardId: string
  design: DraftDesign
  onChange: (patch: Partial<DraftDesign>) => void
  errors: Record<string, string>
}) {
  const [uploading, setUploading] = React.useState(false)
  const [uploadError, setUploadError] = React.useState<string | null>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)

  const upload = async (file: File) => {
    setUploading(true)
    setUploadError(null)
    try {
      const form = new FormData()
      form.set('cardId', cardId)
      form.set('kind', 'LOGO')
      form.set('file', file)
      const result = await uploadAssetAction(form)
      if (!result.success) {
        setUploadError(result.error.message)
        return
      }
      onChange({ logoAssetId: result.data.id, logoUrl: result.data.url })
    } finally {
      setUploading(false)
    }
  }

  return (
    <EditorSection title="Aussehen" description="Farben und Logo — gelten für alle Personen dieser Karte.">
      <div className="space-y-2">
        <p className="text-[12.5px] font-medium text-ink">Farben</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {COLOR_PRESETS.map((preset) => {
            const active =
              design.backgroundColor.toLowerCase() === preset.bg &&
              design.foregroundColor.toLowerCase() === preset.fg
            return (
              <button
                key={preset.name}
                type="button"
                onClick={() => onChange({ backgroundColor: preset.bg, foregroundColor: preset.fg, labelColor: preset.label })}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-lg border p-1.5 text-[11px] text-ink-2 transition-colors',
                  active ? 'border-accent bg-accent/10' : 'border-line hover:border-ink-3',
                )}
              >
                <span
                  className="flex h-8 w-full items-center justify-center rounded-md text-[11px] font-semibold"
                  style={{ backgroundColor: preset.bg, color: preset.fg, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)' }}
                >
                  {active ? <Check className="size-3.5" /> : 'Aa'}
                </span>
                {preset.name}
              </button>
            )
          })}
        </div>
        <details className="group">
          <summary className="cursor-pointer text-[12px] text-ink-3 hover:text-ink">Eigene Farben</summary>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <ColorField label="Hintergrund" value={design.backgroundColor} onChange={(v) => onChange({ backgroundColor: v })} />
            <ColorField label="Schrift" value={design.foregroundColor} onChange={(v) => onChange({ foregroundColor: v })} />
            <ColorField label="Beschriftung" value={design.labelColor} onChange={(v) => onChange({ labelColor: v })} />
          </div>
        </details>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Titel oben auf der Karte"
          htmlFor="bc-title"
          hint="Leer lassen, dann steht dort der Firmenname."
          error={errors['design.cardTitle']}
        >
          <Input
            id="bc-title"
            value={design.cardTitle}
            maxLength={40}
            placeholder="Firmenname"
            onChange={(e) => onChange({ cardTitle: e.target.value })}
          />
        </Field>

        <Field label="Logo" htmlFor="bc-logo" error={uploadError ?? errors['design.logoAssetId']}>
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-surface-2">
              {design.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={design.logoUrl} alt="" className="max-h-7 max-w-[72px] object-contain" />
              ) : (
                <span className="text-[11px] text-ink-3">kein Logo</span>
              )}
            </span>
            <input
              ref={fileRef}
              id="bc-logo"
              type="file"
              accept={ACCEPTED_UPLOAD_MIME}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void upload(file)
                e.target.value = ''
              }}
            />
            <Button variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? <Spinner /> : <Upload />}
              {design.logoAssetId ? 'Ersetzen' : 'Hochladen'}
            </Button>
            {design.logoAssetId ? (
              <Button variant="ghost" size="sm" onClick={() => onChange({ logoAssetId: null, logoUrl: null })}>
                Entfernen
              </Button>
            ) : null}
          </div>
        </Field>
      </div>
    </EditorSection>
  )
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="space-y-1 text-[12px] font-medium text-ink">
      <span>{label}</span>
      <span className="flex items-center gap-2 rounded-md border border-line bg-surface px-2 py-1.5">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="size-6 cursor-pointer rounded border-0 bg-transparent p-0"
        />
        <span className="font-mono text-[11.5px] text-ink-2">{value}</span>
      </span>
    </label>
  )
}
