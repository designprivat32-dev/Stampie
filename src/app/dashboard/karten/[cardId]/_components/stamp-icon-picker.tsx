'use client'

import * as React from 'react'
import { Check, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/misc'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { STAMP_ICONS } from '@/lib/cards/stamp-icons'
import { uploadAssetAction } from '@/actions/assets'
import { MAX_UPLOAD_BYTES } from '@/lib/images/upload-constraints'
import { useCardEditor } from '@/stores/card-editor-provider'
import { cn } from '@/lib/utils'

const EMOJI_SUGGESTIONS = [
  '☕', '🍕', '✂️', '🍦', '🥙', '🧁', '💅', '❤️', '⭐', '✅',
  '🐾', '🍺', '🍔', '🌸', '🥐', '🍩', '🍰', '🍜', '🌮', '🥗',
  '🍣', '🧋', '🍫', '🚗', '💈', '💇', '🪒', '🧼', '🎁', '🏆',
] as const

/**
 * Stamp icon selection: curated library, emoji, or an own upload.
 *
 * Emoji are rasterised *in the browser* and uploaded like any other custom icon. The
 * server has no colour emoji font, so rendering them server-side would either need a
 * bundled emoji sprite set or produce empty boxes — this way the platform the user is
 * already looking at draws the glyph they picked.
 */
export function StampIconPicker() {
  const cardId = useCardEditor((s) => s.cardId)
  const stampIcon = useCardEditor((s) => s.design.stampIcon)
  const stampIconAssetId = useCardEditor((s) => s.design.stampIconAssetId)
  const patch = useCardEditor((s) => s.patch)
  const setAssetUrl = useCardEditor((s) => s.setAssetUrl)
  const assetUrls = useCardEditor((s) => s.assetUrls)

  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [customEmoji, setCustomEmoji] = React.useState('')
  const fileRef = React.useRef<HTMLInputElement>(null)

  const uploadIcon = async (file: File, iconKey: string) => {
    setBusy(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.set('cardId', cardId)
      formData.set('kind', 'STAMP_ICON')
      formData.set('file', file)

      const result = await uploadAssetAction(formData)
      if (!result.success) {
        setError(result.error.message)
        return
      }
      setAssetUrl(result.data.id, result.data.url)
      patch({ stampIcon: iconKey, stampIconAssetId: result.data.id })
    } catch {
      setError('Upload fehlgeschlagen. Bitte erneut versuchen.')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const pickEmoji = async (emoji: string) => {
    const blob = await renderEmojiToPng(emoji)
    if (!blob) {
      setError('Dieses Emoji konnte nicht gerendert werden.')
      return
    }
    await uploadIcon(new File([blob], 'emoji.png', { type: 'image/png' }), emojiKey(emoji))
  }

  const currentEmoji = stampIcon.startsWith('emoji:') ? stampIconAssetId : null
  const currentCustomUrl =
    stampIconAssetId && (stampIcon === 'custom' || stampIcon.startsWith('emoji:'))
      ? (assetUrls[stampIconAssetId] ?? null)
      : null

  return (
    <div className="space-y-2">
      <Tabs defaultValue="library">
        <TabsList>
          <TabsTrigger value="library">Bibliothek</TabsTrigger>
          <TabsTrigger value="emoji">Emoji</TabsTrigger>
          <TabsTrigger value="upload">Eigenes Bild</TabsTrigger>
        </TabsList>

        <TabsContent value="library" className="pt-3">
          <div role="radiogroup" aria-label="Stempel-Symbol" className="grid grid-cols-7 gap-1.5">
            {STAMP_ICONS.map((icon) => {
              const selected = stampIcon === icon.key
              return (
                <button
                  key={icon.key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={icon.label}
                  title={icon.label}
                  data-slot="control"
                  onClick={() => patch({ stampIcon: icon.key, stampIconAssetId: null })}
                  className={cn(
                    'flex aspect-square items-center justify-center rounded-md border transition-colors',
                    selected
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink',
                  )}
                >
                  <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
                    <path d={icon.path} fill="currentColor" fillRule={icon.fillRule} />
                  </svg>
                </button>
              )
            })}
          </div>
        </TabsContent>

        <TabsContent value="emoji" className="space-y-3 pt-3">
          <div className="grid grid-cols-10 gap-1">
            {EMOJI_SUGGESTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                data-slot="control"
                disabled={busy}
                aria-label={`Emoji ${emoji}`}
                onClick={() => void pickEmoji(emoji)}
                className={cn(
                  'flex aspect-square items-center justify-center rounded-md border text-lg transition-colors',
                  stampIcon === emojiKey(emoji)
                    ? 'border-accent bg-accent-soft'
                    : 'border-line bg-surface hover:border-line-strong',
                )}
              >
                {emoji}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="custom-emoji">Anderes Emoji</Label>
            <div className="flex gap-2">
              <Input
                id="custom-emoji"
                value={customEmoji}
                maxLength={8}
                placeholder="z. B. 🥨"
                onChange={(e) => setCustomEmoji(e.target.value)}
              />
              <Button
                variant="outline"
                disabled={busy || customEmoji.trim().length === 0}
                onClick={() => void pickEmoji(customEmoji.trim())}
              >
                {busy ? <Spinner /> : null}
                Übernehmen
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="upload" className="space-y-2 pt-3">
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-line bg-surface-2 p-3">
            <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-surface">
              {currentCustomUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={currentCustomUrl} alt="" className="size-full object-contain p-1" />
              ) : (
                <Upload className="size-4 text-ink-3" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-ink">Eigenes Symbol</p>
              <p className="text-[11.5px] leading-snug text-ink-3">
                PNG, JPG oder SVG · quadratisch · wird auf 128 × 128 normalisiert
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              {busy ? <Spinner /> : null}
              Hochladen
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                if (file.size > MAX_UPLOAD_BYTES) {
                  setError('Die Datei ist größer als 5 MB.')
                  return
                }
                void uploadIcon(file, 'custom')
              }}
            />
          </div>
          {currentEmoji || currentCustomUrl ? (
            <p className="flex items-center gap-1.5 text-[12px] text-ok">
              <Check className="size-3.5" />
              Eigenes Symbol aktiv.
            </p>
          ) : null}
        </TabsContent>
      </Tabs>

      {error ? (
        <p role="alert" className="text-[12px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function emojiKey(emoji: string): string {
  const points = [...emoji].map((c) => c.codePointAt(0)?.toString(16) ?? '').filter(Boolean)
  return `emoji:${points.join('-')}`
}

/** Draws the glyph with the fonts the user's own device has. */
async function renderEmojiToPng(emoji: string): Promise<Blob | null> {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.clearRect(0, 0, size, size)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `${Math.round(size * 0.78)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`
  ctx.fillText(emoji, size / 2, size / 2 + size * 0.04)

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'))
}
