'use client'

import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { PanelSection, RadioCard, RadioGroup } from '@/components/ui/misc'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import { StampIconPicker } from '../stamp-icon-picker'
import { StampStripImg } from '../preview/stamp-strip-img'
import { stripPreviewUrl } from '@/lib/cards/preview-url'
import { EMPTY_STAMP_STYLES, STAMP_GOAL_MAX, STAMP_GOAL_MIN } from '@/lib/cards/schema'
import { useCardEditor } from '@/stores/card-editor-provider'
import { useDebounced } from '@/hooks/use-debounced'

const EMPTY_STYLE_LABELS: Record<(typeof EMPTY_STAMP_STYLES)[number], { label: string; hint: string }> =
  {
    outline: { label: 'Umriss', hint: 'Leerer Kreis' },
    transparent: { label: 'Transparent', hint: 'Symbol bei 25 %' },
    dashed: { label: 'Gestrichelt', hint: 'Gestrichelter Kreis' },
  }

export function ProgramTab() {
  const cardId = useCardEditor((s) => s.cardId)
  const liveDesign = useCardEditor((s) => s.design)
  const design = useDebounced(liveDesign, 150)
  const patch = useCardEditor((s) => s.patch)
  const setSimulatedStamps = useCardEditor((s) => s.setSimulatedStamps)
  const simulatedStamps = useCardEditor((s) => s.simulatedStamps)

  // Panel preview always shows a partially filled card — an empty grid tells you nothing.
  const panelStamps = Math.min(design.stampGoal, Math.max(1, Math.ceil(design.stampGoal * 0.6)))

  return (
    <div>
      <PanelSection title="Anzahl Stempel" description="Wie oft muss der Kunde kommen?">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="stamp-goal">Stempel bis zur Belohnung</Label>
            <span className="text-[15px] font-semibold tabular-nums text-ink">
              {liveDesign.stampGoal}
            </span>
          </div>
          <Slider
            id="stamp-goal"
            min={STAMP_GOAL_MIN}
            max={STAMP_GOAL_MAX}
            step={1}
            value={[liveDesign.stampGoal]}
            onValueChange={([next]) => {
              const goal = next ?? STAMP_GOAL_MIN
              patch({ stampGoal: goal })
              if (simulatedStamps > goal) setSimulatedStamps(goal)
            }}
            aria-label="Anzahl Stempel"
          />
          <div className="flex justify-between text-[11px] text-ink-3">
            <span>{STAMP_GOAL_MIN}</span>
            <span>{STAMP_GOAL_MAX}</span>
          </div>
        </div>
      </PanelSection>

      <PanelSection title="Belohnung" description="Erscheint auf der Karte und auf der Rückseite.">
        <Field label="Belohnungstext" htmlFor="reward-text">
          <Input
            id="reward-text"
            value={liveDesign.rewardText}
            maxLength={80}
            placeholder="Jeder 10. Kaffee gratis"
            onChange={(e) => patch({ rewardText: e.target.value })}
          />
        </Field>
      </PanelSection>

      <PanelSection title="Stempel-Symbol">
        <StampIconPicker />
      </PanelSection>

      <PanelSection title="Offene Stempel" description="Wie leere Felder dargestellt werden.">
        <RadioGroup
          className="grid-cols-3"
          value={liveDesign.emptyStampStyle}
          onValueChange={(value) =>
            patch({ emptyStampStyle: value as (typeof EMPTY_STAMP_STYLES)[number] })
          }
        >
          {EMPTY_STAMP_STYLES.map((style) => (
            <RadioCard
              key={style}
              value={style}
              label={EMPTY_STYLE_LABELS[style].label}
              hint={EMPTY_STYLE_LABELS[style].hint}
            />
          ))}
        </RadioGroup>
      </PanelSection>

      <PanelSection title="Raster-Vorschau" description="Exakt das Bild, das in die Karte wandert.">
        <div className="overflow-hidden rounded-lg border border-line">
          <StampStripImg
            src={stripPreviewUrl(design, {
              cardId,
              currentStamps: panelStamps,
              target: 'apple',
              scale: 2,
            })}
            alt={`Stempelraster mit ${design.stampGoal} Feldern`}
            aspect={375 / 123}
          />
        </div>
      </PanelSection>
    </div>
  )
}
