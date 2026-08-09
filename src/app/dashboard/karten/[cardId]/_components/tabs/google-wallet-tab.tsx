'use client'

import { Info } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Field, Label } from '@/components/ui/label'
import { PanelSection } from '@/components/ui/misc'
import { Switch } from '@/components/ui/switch'
import { useCardEditor } from '@/stores/card-editor-provider'

export function GoogleWalletTab() {
  const design = useCardEditor((s) => s.design)
  const patch = useCardEditor((s) => s.patch)

  return (
    <div>
      <PanelSection
        title="Labels"
        description="Bezeichnungen in der Detailansicht der Karte (optional)."
      >
        <div className="space-y-3">
          <Field
            label="Label für Kontoinhaber"
            htmlFor="account-name-label"
            hint={'z. B. "Mitglied", "Kunde"'}
          >
            <Input
              id="account-name-label"
              value={design.accountNameLabel ?? ''}
              maxLength={15}
              placeholder="Mitglied"
              onChange={(e) => patch({ accountNameLabel: e.target.value || null })}
            />
          </Field>

          <Field
            label="Label für ID"
            htmlFor="account-id-label"
            hint={'z. B. "Nr.", "ID"'}
          >
            <Input
              id="account-id-label"
              value={design.accountIdLabel ?? ''}
              maxLength={15}
              placeholder="Nr."
              onChange={(e) => patch({ accountIdLabel: e.target.value || null })}
            />
          </Field>

          <Field
            label="Label für Stufe"
            htmlFor="rewards-tier-label"
            hint={'z. B. "Stufe", "Level"'}
          >
            <Input
              id="rewards-tier-label"
              value={design.rewardsTierLabel ?? ''}
              maxLength={9}
              placeholder="Stufe"
              onChange={(e) => patch({ rewardsTierLabel: e.target.value || null })}
            />
          </Field>
        </div>
      </PanelSection>

      <PanelSection
        title="Stufen-System"
        description="Zeigt eine Stufe in der Detailansicht an (z. B. Gold, Silber)."
      >
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-4 rounded-lg border border-line bg-surface p-3">
            <div className="min-w-0">
              <Label htmlFor="rewards-tier-enabled">Stufe anzeigen</Label>
              <p className="mt-0.5 text-[12px] leading-snug text-ink-3">
                Zeigt den Stufen-Namen in der Detailansicht.
              </p>
            </div>
            <Switch
              id="rewards-tier-enabled"
              checked={design.googleRewardsTierEnabled}
              onCheckedChange={(checked) => patch({ googleRewardsTierEnabled: checked })}
            />
          </div>

          {design.googleRewardsTierEnabled ? (
            <Field
              label="Stufen-Name"
              htmlFor="rewards-tier"
              hint="Max. 7 Zeichen"
            >
              <Input
                id="rewards-tier"
                value={design.rewardsTier ?? ''}
                maxLength={7}
                placeholder="Gold"
                onChange={(e) => patch({ rewardsTier: e.target.value || null })}
              />
            </Field>
          ) : null}
        </div>
      </PanelSection>

      <PanelSection
        title="Kundenname"
        description="Name des Karteninhabers auf der Karte."
      >
        <div className="flex items-start justify-between gap-4 rounded-lg border border-line bg-surface p-3">
          <div className="min-w-0">
            <Label htmlFor="account-name-enabled">Kundenname anzeigen</Label>
            <p className="mt-0.5 text-[12px] leading-snug text-ink-3">
              Der Name wird bei der Karten-Ausgabe vergeben.
            </p>
          </div>
          <Switch
            id="account-name-enabled"
            checked={design.googleAccountNameEnabled}
            onCheckedChange={(checked) => patch({ googleAccountNameEnabled: checked })}
          />
        </div>
      </PanelSection>

      <PanelSection title="Hinweise">
        <div className="rounded-lg border border-line bg-surface p-3">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 size-4 shrink-0 text-ink-3" />
            <div className="text-[12px] leading-snug text-ink-3">
              <p>
                Diese Einstellungen gelten nur für Google Wallet. Apple Wallet zeigt diese
                Felder nicht an.
              </p>
              <p className="mt-1">
                Labels sind optional — ohne Eingabe wird nichts angezeigt.
              </p>
              <p className="mt-1">
                Google zeigt diese Felder erst, wenn der Kunde die Karte aufklappt — nicht auf
                der Kartenvorderseite. In der Vorschau stehen sie deshalb unter „Rückseite".
              </p>
            </div>
          </div>
        </div>
      </PanelSection>
    </div>
  )
}
