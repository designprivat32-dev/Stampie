'use client'

import * as React from 'react'
import { Download, Moon, RotateCw, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/misc'
import { useCardEditor } from '@/stores/card-editor-provider'
import { cn } from '@/lib/utils'

/** Two-option segmented control — used for platform and for front/back. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (next: T) => void
  options: ReadonlyArray<{ value: T; label: string }>
  label: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-lg border border-line bg-surface p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          data-slot="control"
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-[6px] px-3 py-1.5 text-[12px] font-medium transition-colors',
            value === option.value ? 'bg-ink text-white' : 'text-ink-2 hover:text-ink',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function PreviewControls({ onExport }: { onExport: () => Promise<void> }) {
  const platform = useCardEditor((s) => s.previewPlatform)
  const setPlatform = useCardEditor((s) => s.setPreviewPlatform)
  const side = useCardEditor((s) => s.previewSide)
  const setSide = useCardEditor((s) => s.setPreviewSide)
  const theme = useCardEditor((s) => s.previewTheme)
  const setTheme = useCardEditor((s) => s.setPreviewTheme)
  const stamps = useCardEditor((s) => s.simulatedStamps)
  const setStamps = useCardEditor((s) => s.setSimulatedStamps)
  const goal = useCardEditor((s) => s.design.stampGoal)

  const [exporting, setExporting] = React.useState(false)
  const [exportError, setExportError] = React.useState<string | null>(null)

  const handleExport = async () => {
    setExporting(true)
    setExportError(null)
    try {
      await onExport()
    } catch {
      setExportError('Export fehlgeschlagen. Bitte erneut versuchen.')
    } finally {
      setExporting(false)
    }
  }

  return (
    // Never compressed by the stage above it — these are the controls, not decoration.
    <div className="w-full max-w-[420px] shrink-0 space-y-4">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Segmented
          label="Plattform"
          value={platform}
          onChange={setPlatform}
          options={[
            { value: 'apple', label: 'iOS Wallet' },
            { value: 'google', label: 'Google Wallet' },
          ]}
        />
        <Segmented
          label="Kartenseite"
          value={side}
          onChange={setSide}
          options={[
            { value: 'front', label: 'Vorderseite' },
            { value: 'back', label: 'Rückseite' },
          ]}
        />
        <Button
          variant="outline"
          size="icon"
          aria-label={theme === 'dark' ? 'Helle Umgebung' : 'Dunkle Umgebung'}
          title={theme === 'dark' ? 'Helle Umgebung' : 'Dunkle Umgebung'}
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? <Sun /> : <Moon />}
        </Button>
      </div>

      <div className="rounded-lg border border-line bg-surface px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="simulate-stamps">Stempel simulieren</Label>
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium tabular-nums text-ink">
              {stamps} / {goal}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Zurücksetzen"
              onClick={() => setStamps(0)}
            >
              <RotateCw />
            </Button>
          </div>
        </div>
        <Slider
          id="simulate-stamps"
          className="mt-1"
          min={0}
          max={goal}
          step={1}
          value={[Math.min(stamps, goal)]}
          onValueChange={([next]) => setStamps(next ?? 0)}
          aria-label="Anzahl gestempelter Felder"
        />
      </div>

      <div className="flex flex-col items-center gap-1.5">
        <Button variant="outline" onClick={handleExport} disabled={exporting} className="w-full">
          {exporting ? <Spinner /> : <Download />}
          Als Bild exportieren
        </Button>
        {exportError ? (
          <p role="alert" className="text-[12px] text-danger">
            {exportError}
          </p>
        ) : null}
      </div>
    </div>
  )
}
