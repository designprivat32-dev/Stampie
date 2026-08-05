'use client'

import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { PanelSection, RadioCard, RadioGroup } from '@/components/ui/misc'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import { StampIconPicker } from '../stamp-icon-picker'
import { EMPTY_STAMP_STYLES, STAMP_GOAL_MAX, STAMP_GOAL_MIN } from '@/lib/cards/schema'
import { useCardEditor } from '@/stores/card-editor-provider'

const EMPTY_STYLE_LABELS: Record<(typeof EMPTY_STAMP_STYLES)[number], { label: string; hint: string }> =
  {
    outline: { label: 'Umriss', hint: 'Leerer Kreis' },
    transparent: { label: 'Transparent', hint: 'Symbol bei 25 %' },
    dashed: { label: 'Gestrichelt', hint: 'Gestrichelter Kreis' },
  }

export function ProgramTab() {
  const liveDesign = useCardEditor((s) => s.design)
  const patch = useCardEditor((s) => s.patch)
  const setSimulatedStamps = useCardEditor((s) => s.setSimulatedStamps)
  const simulatedStamps = useCardEditor((s) => s.simulatedStamps)

  return (
    <div>
      {/* The card on the right is the preview. A second grid below said the same thing twice. */}
      <PanelSection title="Anzahl Stempel">
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

      <PanelSection title="Belohnung">
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

      <PanelSection title="Offene Stempel">
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
    </div>
  )
}
