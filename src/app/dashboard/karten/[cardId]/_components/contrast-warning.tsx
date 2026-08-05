'use client'

import { AlertTriangle, Check, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { autoFixForeground, evaluateContrast } from '@/lib/color/contrast'
import { useCardEditor } from '@/stores/card-editor-provider'
import { cn } from '@/lib/utils'

/**
 * Live WCAG contrast readout.
 *
 * Shop owners pick neon pink on white. Below 4.5:1 we warn with a one-click fix; below
 * 3:1 the publish action is blocked unless it is explicitly confirmed.
 *
 * The label colour is checked too — light grey labels on a light card is the more common
 * real-world failure — but it only ever warns, it never blocks.
 */
export function ContrastWarning() {
  const foregroundColor = useCardEditor((s) => s.design.foregroundColor)
  const backgroundColor = useCardEditor((s) => s.design.backgroundColor)
  const labelColor = useCardEditor((s) => s.design.labelColor)
  const patch = useCardEditor((s) => s.patch)

  const text = evaluateContrast(foregroundColor, backgroundColor)
  const label = evaluateContrast(labelColor, backgroundColor)
  const labelLevel = label.level === 'block' ? 'warn' : label.level

  // Nothing to report is worth one line, not two green boxes standing there permanently.
  if (text.level === 'ok' && labelLevel === 'ok') {
    return (
      <p className="flex items-center gap-1.5 text-[12px] text-ok">
        <Check className="size-3.5 shrink-0" />
        Kontrast in Ordnung
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {text.level === 'ok' ? null : (
        <ContrastRow
          title="Text auf Hintergrund"
          ratio={text.ratio}
          level={text.level}
          blocking
          onFix={() =>
            patch({ foregroundColor: autoFixForeground(foregroundColor, backgroundColor, 4.5) })
          }
        />
      )}
      {labelLevel === 'ok' ? null : (
        <ContrastRow
          title="Label auf Hintergrund"
          ratio={label.ratio}
          level={labelLevel}
          blocking={false}
          onFix={() => patch({ labelColor: autoFixForeground(labelColor, backgroundColor, 4.5) })}
        />
      )}
    </div>
  )
}

function ContrastRow({
  title,
  ratio,
  level,
  blocking,
  onFix,
}: {
  title: string
  ratio: number
  level: 'warn' | 'block'
  blocking: boolean
  onFix: () => void
}) {
  const tone = {
    warn: 'border-warn/40 bg-warn-soft text-warn-ink',
    block: 'border-danger/30 bg-danger-soft text-danger',
  }[level]

  const message = {
    warn: 'Grenzwertig.',
    block: blocking ? 'Zu gering — Veröffentlichen nur mit Bestätigung.' : 'Zu gering.',
  }[level]

  return (
    <div className={cn('flex items-start gap-3 rounded-lg border px-3 py-2.5', tone)}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[12px] font-medium">{title}</span>
          <span className="text-[12px] font-semibold tabular-nums">{ratio.toFixed(2)}:1</span>
        </div>
        <p className="text-[11.5px] leading-snug opacity-90">{message}</p>
      </div>

      <Button variant="outline" size="sm" onClick={onFix} className="shrink-0 bg-surface">
        <Wand2 />
        Korrigieren
      </Button>
    </div>
  )
}
