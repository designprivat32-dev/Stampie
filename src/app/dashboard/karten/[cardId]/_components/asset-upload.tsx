'use client'

import * as React from 'react'
import { AlertTriangle, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/misc'
import { LogoCropDialog } from './dialogs/logo-crop-dialog'
import { deleteAssetAction, uploadAssetAction, type UploadedAsset } from '@/actions/assets'
import { MAX_UPLOAD_BYTES, type AssetKind, type CropRect } from '@/lib/images/upload-constraints'
import { useCardEditor } from '@/stores/card-editor-provider'
import { cn } from '@/lib/utils'

const ACCEPT = 'image/png,image/jpeg,image/svg+xml'

/**
 * Upload control with an optional crop step.
 *
 * Loading and error states are explicit on purpose: a failed upload has to say what went
 * wrong in the panel, not leave a blank frame behind.
 */
export function AssetUpload({
  kind,
  assetId,
  onUploaded,
  onCleared,
  label,
  hint,
  aspect,
  previewClassName,
  cropTitle,
  cropDescription,
}: {
  kind: AssetKind
  assetId: string | null
  onUploaded: (asset: UploadedAsset) => void
  onCleared: () => void
  label: string
  hint: string
  /** Set to enable the crop step; omit to upload as-is. */
  aspect?: number
  previewClassName?: string
  cropTitle?: string
  cropDescription?: string
}) {
  const cardId = useCardEditor((s) => s.cardId)
  const assetUrls = useCardEditor((s) => s.assetUrls)
  const setAssetUrl = useCardEditor((s) => s.setAssetUrl)

  const inputRef = React.useRef<HTMLInputElement>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [pendingFile, setPendingFile] = React.useState<File | null>(null)
  const [pendingUrl, setPendingUrl] = React.useState<string | null>(null)

  const url = assetId ? (assetUrls[assetId] ?? null) : null

  React.useEffect(() => {
    if (!pendingUrl) return
    return () => URL.revokeObjectURL(pendingUrl)
  }, [pendingUrl])

  const upload = async (file: File, crop: CropRect | null) => {
    setBusy(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.set('cardId', cardId)
      formData.set('kind', kind)
      formData.set('file', file)
      if (crop) formData.set('crop', JSON.stringify(crop))

      const result = await uploadAssetAction(formData)
      if (!result.success) {
        setError(result.error.message)
        return
      }
      setAssetUrl(result.data.id, result.data.url)
      onUploaded(result.data)
    } catch {
      setError('Upload fehlgeschlagen. Bitte Verbindung prüfen und erneut versuchen.')
    } finally {
      setBusy(false)
      setPendingFile(null)
      setPendingUrl(null)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleFile = (file: File) => {
    setError(null)
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('Die Datei ist größer als 5 MB.')
      return
    }
    if (aspect) {
      setPendingFile(file)
      setPendingUrl(URL.createObjectURL(file))
      return
    }
    void upload(file, null)
  }

  const handleRemove = async () => {
    if (!assetId) return
    setBusy(true)
    setError(null)
    try {
      const result = await deleteAssetAction(cardId, assetId)
      if (!result.success) {
        setError(result.error.message)
        return
      }
      onCleared()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <div
        className={cn(
          'flex items-center gap-3 rounded-lg border border-dashed border-line bg-surface-2 p-3',
          error && 'border-danger/50',
        )}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const file = e.dataTransfer.files[0]
          if (file) handleFile(file)
        }}
      >
        <div
          className={cn(
            'flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-surface',
            previewClassName ?? 'h-12 w-24',
          )}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="size-full object-contain p-1" />
          ) : (
            <Upload className="size-4 text-ink-3" />
          )}
        </div>

        {/* One line each. A wrapping hint turned every upload into a three-line block. */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-ink">{label}</p>
          <p className="truncate text-[11.5px] text-ink-3" title={hint}>
            {hint}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? <Spinner /> : null}
            {url ? 'Ersetzen' : 'Hochladen'}
          </Button>
          {url ? (
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={busy}
              aria-label={`${label} entfernen`}
              onClick={handleRemove}
            >
              <Trash2 />
            </Button>
          ) : null}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
          }}
        />
      </div>

      {error ? (
        <p role="alert" className="flex items-start gap-1.5 text-[12px] text-danger">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </p>
      ) : null}

      {aspect ? (
        <LogoCropDialog
          open={pendingFile !== null}
          onOpenChange={(open) => {
            if (!open) {
              setPendingFile(null)
              setPendingUrl(null)
              if (inputRef.current) inputRef.current.value = ''
            }
          }}
          imageUrl={pendingUrl}
          aspect={aspect}
          title={cropTitle ?? 'Ausschnitt wählen'}
          description={cropDescription ?? 'Der Ausschnitt wird serverseitig zugeschnitten.'}
          onConfirm={(crop) => {
            if (pendingFile) void upload(pendingFile, crop)
          }}
        />
      ) : null}
    </div>
  )
}
