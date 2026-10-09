'use client'

import * as React from 'react'
import { Plus, X } from 'lucide-react'
import { Spinner } from '@/components/ui/misc'
import { uploadAssetAction } from '@/actions/assets'
import { MAX_UPLOAD_BYTES } from '@/lib/images/upload-constraints'
import { MAX_EXTRA_STAMP_ICONS } from '@/lib/cards/schema'
import { useCardEditor } from '@/stores/card-editor-provider'

/**
 * Weitere eigene Stempelbilder, die sich mit dem ersten abwechseln.
 *
 * Feld 1 zeigt das erste Bild, Feld 2 das zweite, … und dann wieder von vorn. Entfernen
 * nimmt ein Bild nur aus der Runde — die Datei selbst bleibt liegen, damit eine bereits
 * veröffentlichte Version nicht ins Leere zeigt.
 */
export function StampIconExtras({ primaryUrl }: { primaryUrl: string }) {
  const cardId = useCardEditor((s) => s.cardId)
  const extraIds = useCardEditor((s) => s.design.stampIconExtraAssetIds)
  const patch = useCardEditor((s) => s.patch)
  const setAssetUrl = useCardEditor((s) => s.setAssetUrl)
  const assetUrls = useCardEditor((s) => s.assetUrls)

  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)

  const canAdd = extraIds.length < MAX_EXTRA_STAMP_ICONS

  const upload = async (files: File[]) => {
    setBusy(true)
    setError(null)
    try {
      const room = MAX_EXTRA_STAMP_ICONS - extraIds.length
      const added: string[] = []
      for (const file of files.slice(0, room)) {
        if (file.size > MAX_UPLOAD_BYTES) {
          setError(`„${file.name}" ist größer als 5 MB.`)
          continue
        }
        const formData = new FormData()
        formData.set('cardId', cardId)
        formData.set('kind', 'STAMP_ICON')
        formData.set('file', file)
        const result = await uploadAssetAction(formData)
        if (!result.success) {
          setError(result.error.message)
          continue
        }
        setAssetUrl(result.data.id, result.data.url)
        added.push(result.data.id)
      }
      if (added.length > 0) patch({ stampIconExtraAssetIds: [...extraIds, ...added] })
      if (files.length > room) {
        setError(`Höchstens ${MAX_EXTRA_STAMP_ICONS + 1} Stempelbilder insgesamt.`)
      }
    } catch {
      setError('Upload fehlgeschlagen. Bitte erneut versuchen.')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const remove = (id: string) =>
    patch({ stampIconExtraAssetIds: extraIds.filter((existing) => existing !== id) })

  return (
    <div className="space-y-2 rounded-lg border border-line bg-surface p-3">
      <div>
        <p className="text-[13px] font-medium text-ink">Abwechselnde Stempelbilder</p>
        <p className="text-[11.5px] leading-snug text-ink-3">
          Weitere Bilder hochladen — die Stempel wechseln dann reihum: 1, 2, 3, 1, 2, 3 …
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Thumb url={primaryUrl} label="1" />
        {extraIds.map((id, i) => (
          <Thumb
            key={id}
            url={assetUrls[id] ?? null}
            label={String(i + 2)}
            onRemove={busy ? undefined : () => remove(id)}
          />
        ))}
        {canAdd ? (
          <button
            type="button"
            data-slot="control"
            disabled={busy}
            aria-label="Weiteres Stempelbild hochladen"
            title="Weiteres Bild hochladen"
            onClick={() => fileRef.current?.click()}
            className="flex size-12 items-center justify-center rounded-md border border-dashed border-line bg-surface-2 text-ink-3 transition-colors hover:border-line-strong hover:text-ink disabled:opacity-50"
          >
            {busy ? <Spinner /> : <Plus className="size-4" />}
          </button>
        ) : null}
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/svg+xml"
          className="sr-only"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            if (files.length > 0) void upload(files)
          }}
        />
      </div>

      {error ? (
        <p role="alert" className="text-[12px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function Thumb({
  url,
  label,
  onRemove,
}: {
  url: string | null
  label: string
  onRemove?: () => void
}) {
  return (
    <div className="relative size-12 shrink-0 overflow-hidden rounded-md border border-line bg-surface-2">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={`Stempelbild ${label}`} className="size-full object-contain p-1" />
      ) : null}
      <span className="absolute bottom-0 left-0 rounded-tr bg-surface/80 px-1 text-[10px] text-ink-3">
        {label}
      </span>
      {onRemove ? (
        <button
          type="button"
          data-slot="control"
          aria-label={`Stempelbild ${label} entfernen`}
          title="Aus der Runde nehmen"
          onClick={onRemove}
          className="absolute right-0 top-0 flex size-4 items-center justify-center rounded-bl bg-surface/90 text-ink-3 hover:text-danger"
        >
          <X className="size-3" />
        </button>
      ) : null}
    </div>
  )
}
