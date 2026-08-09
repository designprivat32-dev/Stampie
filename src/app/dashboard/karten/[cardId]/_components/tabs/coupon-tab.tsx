'use client'

import { Info } from 'lucide-react'
import { Input, Textarea } from '@/components/ui/input'
import { Field, Label } from '@/components/ui/label'
import { PanelSection } from '@/components/ui/misc'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCardEditor } from '@/stores/card-editor-provider'
import type { CardKind, RedemptionChannel } from '@/lib/cards/schema'

/**
 * The coupon editor, used by both card kinds.
 *
 * For a COUPON card these fields *are* the card. For a STAMP card they describe the coupon
 * a full card hands out, which is why they sit behind a switch there — a shop that just
 * wants a line of reward text should not be asked to fill them in.
 */
export function CouponTab({ kind }: { kind: CardKind }) {
  const design = useCardEditor((s) => s.design)
  const patch = useCardEditor((s) => s.patch)

  const isRewardCoupon = kind === 'STAMP'
  // On a stamp card the fields only matter once the reward coupon is switched on.
  const fieldsActive = !isRewardCoupon || design.rewardCouponEnabled

  return (
    <div>
      {isRewardCoupon ? (
        <PanelSection
          title="Belohnung als Gutschein"
          description="Statt nur eines Hinweistextes bekommt der Kunde einen echten Gutschein in die Wallet."
        >
          <div className="flex items-start justify-between gap-4 rounded-lg border border-line bg-surface p-3">
            <div className="min-w-0">
              <Label htmlFor="reward-coupon-enabled">Gutschein ausgeben</Label>
              <p className="mt-0.5 text-[12px] leading-snug text-ink-3">
                Sobald die Karte voll ist und eingelöst wird, wandert ein Gutschein-Pass in die
                Wallet des Kunden. Die Stempelkarte selbst bleibt und beginnt von vorn.
              </p>
            </div>
            <Switch
              id="reward-coupon-enabled"
              checked={design.rewardCouponEnabled}
              onCheckedChange={(checked) => patch({ rewardCouponEnabled: checked })}
            />
          </div>
        </PanelSection>
      ) : null}

      {fieldsActive ? (
        <>
          <PanelSection
            title="Der Gutschein"
            description="Was der Kunde bekommt — das ist die Zeile, die er wirklich liest."
          >
            <div className="space-y-3">
              <Field
                label="Titel"
                htmlFor="offer-title"
                hint="Pflichtfeld · max. 60 Zeichen, z. B. „20 % auf alles“"
              >
                <Input
                  id="offer-title"
                  value={design.offerTitle ?? ''}
                  maxLength={60}
                  placeholder="20 % auf alles"
                  onChange={(e) => patch({ offerTitle: e.target.value || null })}
                />
              </Field>

              <Field
                label="Beschreibung"
                htmlFor="offer-details"
                hint="Optional · erklärt den Gutschein genauer."
              >
                <Textarea
                  id="offer-details"
                  value={design.offerDetails ?? ''}
                  maxLength={500}
                  rows={3}
                  placeholder="Gilt auf das gesamte Sortiment."
                  onChange={(e) => patch({ offerDetails: e.target.value || null })}
                />
              </Field>

              <Field
                label="Einlösebedingungen"
                htmlFor="offer-fine-print"
                hint="Optional · steht auf der Rückseite."
              >
                <Textarea
                  id="offer-fine-print"
                  value={design.offerFinePrint ?? ''}
                  maxLength={500}
                  rows={3}
                  placeholder="Nicht mit anderen Aktionen kombinierbar. Einmal einlösbar."
                  onChange={(e) => patch({ offerFinePrint: e.target.value || null })}
                />
              </Field>
            </div>
          </PanelSection>

          <PanelSection
            title="Einlösung"
            description="Wo der Gutschein gilt. Google verlangt diese Angabe."
          >
            <Field label="Einlösbar" htmlFor="redemption-channel">
              <Select
                value={design.redemptionChannel}
                onValueChange={(value) => patch({ redemptionChannel: value as RedemptionChannel })}
              >
                <SelectTrigger id="redemption-channel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INSTORE">Nur im Laden</SelectItem>
                  <SelectItem value="ONLINE">Nur online</SelectItem>
                  <SelectItem value="BOTH">Im Laden und online</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </PanelSection>
        </>
      ) : null}

      <PanelSection title="Hinweise">
        <div className="rounded-lg border border-line bg-surface p-3">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 size-4 shrink-0 text-ink-3" />
            <div className="space-y-1 text-[12px] leading-snug text-ink-3">
              <p>
                Ein Gutschein ist einmalig. Nach dem Einlösen an der Kasse wandert er beim Kunden
                zu den abgelaufenen Pässen und lässt sich nicht erneut vorzeigen.
              </p>
              {isRewardCoupon ? (
                <p>
                  Der Gutschein ist ein eigener Pass, kein umgewandelter. Die Stempelkarte bleibt
                  in der Wallet und sammelt weiter — Wallet-Pässe können ihren Typ nicht wechseln.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </PanelSection>
    </div>
  )
}
