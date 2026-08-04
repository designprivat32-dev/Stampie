'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/misc'
import { StampStripImg } from '../preview/stamp-strip-img'
import { applyTemplateAction } from '@/actions/card-design'
import { CARD_TEMPLATES, templateAsDesign, type CardTemplate } from '@/lib/cards/templates'
import { stripPreviewUrl } from '@/lib/cards/preview-url'
import { useCardEditor, useTemporal } from '@/stores/card-editor-provider'
import { cn } from '@/lib/utils'

/**
 * Industry presets. Opens automatically on a never-touched card, and is reachable from
 * the header afterwards. Each tile previews through the real renderer, so what the shop
 * owner sees in the 30-second demo is what they get.
 */
export function TemplateDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const cardId = useCardEditor((s) => s.cardId)
  const design = useCardEditor((s) => s.design)
  const replaceDesign = useCardEditor((s) => s.replaceDesign)
  const markSaved = useCardEditor((s) => s.markSaved)
  const { clear } = useTemporal()

  const [selected, setSelected] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const apply = async (templateId: string) => {
    setBusy(true)
    setError(null)
    try {
      const result = await applyTemplateAction(cardId, templateId, design)
      if (!result.success) {
        setError(result.error.message)
        return
      }
      replaceDesign(result.data)
      markSaved(result.data)
      clear()
      onOpenChange(false)
    } catch {
      setError('Die Vorlage konnte nicht übernommen werden.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Vorlage wählen</DialogTitle>
          <DialogDescription>
            Setzt Farben, Symbol, Stempelzahl und Texte. Logo, Rückseite und Standorte bleiben
            erhalten.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          {CARD_TEMPLATES.map((template) => (
            <TemplateTile
              key={template.id}
              template={template}
              cardId={cardId}
              selected={selected === template.id}
              onSelect={() => setSelected(template.id)}
            />
          ))}
        </div>

        {error ? (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Ohne Vorlage starten
          </Button>
          <Button
            variant="primary"
            disabled={!selected || busy}
            onClick={() => selected && apply(selected)}
          >
            {busy ? <Spinner /> : null}
            Vorlage übernehmen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TemplateTile({
  template,
  cardId,
  selected,
  onSelect,
}: {
  template: CardTemplate
  cardId: string
  selected: boolean
  onSelect: () => void
}) {
  const preview = templateAsDesign(template)
  const stamps = Math.ceil(preview.stampGoal * 0.6)

  return (
    <button
      type="button"
      data-slot="control"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'overflow-hidden rounded-xl border text-left transition-colors',
        selected ? 'border-accent ring-2 ring-accent/30' : 'border-line hover:border-line-strong',
      )}
    >
      <div style={{ backgroundColor: preview.backgroundColor }}>
        <div className="flex items-center justify-between px-3 pb-1.5 pt-2.5">
          <span
            className="text-[12px] font-semibold"
            style={{ color: preview.foregroundColor }}
          >
            {template.badge} {preview.programName}
          </span>
          <span className="text-[11px] tabular-nums" style={{ color: preview.labelColor }}>
            {stamps}/{preview.stampGoal}
          </span>
        </div>
        <StampStripImg
          src={stripPreviewUrl(preview, { cardId, currentStamps: stamps, scale: 2 })}
          alt={`Vorlage ${template.name}`}
          aspect={375 / 123}
        />
      </div>

      <div className="space-y-0.5 bg-surface px-3 py-2.5">
        <p className="text-[13px] font-medium text-ink">{template.name}</p>
        <p className="text-[12px] leading-snug text-ink-3">{template.description}</p>
      </div>
    </button>
  )
}
