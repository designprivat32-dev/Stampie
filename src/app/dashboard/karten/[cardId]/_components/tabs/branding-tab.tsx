'use client'

import * as React from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PanelSection, Spinner, TabPanel } from '@/components/ui/misc'
import { AssetUpload } from '../asset-upload'
import { ColorField, PaletteRow } from '../color-field'
import { ContrastWarning } from '../contrast-warning'
import { PlatformSupportBadge } from '../platform-support-badge'
import { deriveIconAction } from '@/actions/assets'
import { useCardEditor } from '@/stores/card-editor-provider'
import type { PaletteSuggestion } from '@/lib/color/extract-palette'

export function BrandingTab() {
  const cardId = useCardEditor((s) => s.cardId)
  const design = useCardEditor((s) => s.design)
  const patch = useCardEditor((s) => s.patch)
  const setAssetUrl = useCardEditor((s) => s.setAssetUrl)

  const [palette, setPalette] = React.useState<PaletteSuggestion | null>(null)
  const [derivingIcon, setDerivingIcon] = React.useState(false)
  const [deriveError, setDeriveError] = React.useState<string | null>(null)

  const handleDeriveIcon = async () => {
    if (!design.logoAssetId) return
    setDerivingIcon(true)
    setDeriveError(null)
    try {
      const result = await deriveIconAction(cardId, design.logoAssetId)
      if (!result.success) {
        setDeriveError(result.error.message)
        return
      }
      setAssetUrl(result.data.id, result.data.url)
      patch({ iconAssetId: result.data.id })
    } catch {
      setDeriveError('Das Icon konnte nicht erzeugt werden.')
    } finally {
      setDerivingIcon(false)
    }
  }

  return (
    <TabPanel>
      {/*
        Logo and icon are two sections, not one. Together they made a single block taller than
        anything else in the editor, and a block that cannot be split is exactly what stops the
        columns from balancing — one column ran past the bottom of the screen while the other
        had room to spare.
      */}
      <PanelSection
        title="Logo"
        description="Wird serverseitig in die von Apple geforderten Größen gerechnet."
      >
        <div className="space-y-3">
          <AssetUpload
            kind="LOGO"
            assetId={design.logoAssetId}
            label="Logo"
            hint="PNG, JPG, SVG · max. 5 MB · Zuschnitt 160 × 50"
            aspect={160 / 50}
            cropTitle="Logo zuschneiden"
            cropDescription="Apple Wallet zeigt das Logo in maximal 160 × 50 Punkten. @2x und @3x werden automatisch erzeugt."
            onUploaded={(asset) => {
              patch({ logoAssetId: asset.id })
              if (asset.palette) setPalette(asset.palette)
            }}
            onCleared={() => {
              patch({ logoAssetId: null })
              setPalette(null)
            }}
          />

          <div className="space-y-2 rounded-lg border border-line bg-surface-2 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] font-medium text-ink">Logo für Google Wallet</p>
              <PlatformSupportBadge field="squareLogo" />
            </div>
            <p className="text-[11.5px] leading-snug text-ink-3">
              Optional. Google beschneidet <strong>rund</strong> — ein breites Logo wird zum
              Streifen. Ohne eigenes Bild wird das obige verwendet.
            </p>
            <AssetUpload
              kind="SQUARE_LOGO"
              assetId={design.squareLogoAssetId}
              label="Quadratisches Logo"
              hint="660 × 660 · am besten transparent"
              aspect={1}
              previewClassName="size-12"
              cropTitle="Quadratisches Logo zuschneiden"
              cropDescription="Google Wallet zeigt das Logo als Kreis. Alles außerhalb des Kreises wird abgeschnitten — wichtige Bildteile also mittig halten."
              onUploaded={(asset) => patch({ squareLogoAssetId: asset.id })}
              onCleared={() => patch({ squareLogoAssetId: null })}
            />
          </div>
        </div>
      </PanelSection>

      <PanelSection title="Icon" description="Pflicht — ohne Icon ist der Pass ungültig.">
        <div className="space-y-3">
          <AssetUpload
            kind="ICON"
            assetId={design.iconAssetId}
            label="Icon (29 × 29)"
            hint="Erscheint in Benachrichtigungen und auf dem Sperrbildschirm."
            aspect={1}
            previewClassName="size-12"
            cropTitle="Icon zuschneiden"
            cropDescription="Quadratisch. Erscheint in Benachrichtigungen und auf dem Sperrbildschirm."
            onUploaded={(asset) => patch({ iconAssetId: asset.id })}
            onCleared={() => patch({ iconAssetId: null })}
          />

          {design.logoAssetId ? (
            <div className="space-y-1">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDeriveIcon}
                disabled={derivingIcon}
                className="w-full"
              >
                {derivingIcon ? <Spinner /> : <Sparkles />}
                Icon aus Logo generieren
              </Button>
              {deriveError ? (
                <p role="alert" className="text-[12px] text-danger">
                  {deriveError}
                </p>
              ) : null}
            </div>
          ) : null}

          {!design.iconAssetId ? (
            <p className="rounded-md border border-warn/40 bg-warn-soft px-3 py-2 text-[12px] leading-snug text-warn-ink">
              Ohne Icon kann die Karte nicht veröffentlicht werden — Apple Wallet lehnt Pässe ohne{' '}
              <code className="font-mono">icon.png</code> ab.
            </p>
          ) : null}
        </div>
      </PanelSection>

      <PanelSection
        title="Farben"
        description="Die Karte ist das einzige farbige Element — der Rest der Oberfläche bleibt neutral."
      >
        <div className="space-y-3">
          {palette && palette.colors.length > 0 ? (
            <div className="space-y-2 rounded-lg border border-line bg-surface-2 p-3">
              <p className="text-[12px] font-medium text-ink">Farben aus dem Logo</p>
              <PaletteRow
                colors={palette.colors}
                onPick={(color) => patch({ backgroundColor: color })}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => patch(palette.recommended)}
                className="w-full bg-surface"
              >
                Vorschlag übernehmen
              </Button>
            </div>
          ) : null}

          <ColorField
            id="background-color"
            label="Hintergrundfarbe"
            value={design.backgroundColor}
            onChange={(backgroundColor) => patch({ backgroundColor })}
            badge={<PlatformSupportBadge field="backgroundColor" />}
          />
          <ColorField
            id="foreground-color"
            label="Textfarbe"
            value={design.foregroundColor}
            onChange={(foregroundColor) => patch({ foregroundColor })}
            badge={<PlatformSupportBadge field="foregroundColor" />}
          />
          <ColorField
            id="label-color"
            label="Labelfarbe"
            value={design.labelColor}
            onChange={(labelColor) => patch({ labelColor })}
            badge={<PlatformSupportBadge field="labelColor" />}
            hint="Die kleinen Beschriftungen über den Werten."
          />

          <ContrastWarning />
        </div>
      </PanelSection>

      <PanelSection
        title="Hintergrundbild"
        description="Optional. Liegt hinter der Stempelreihe."
        action={<PlatformSupportBadge field="hero" />}
      >
        <AssetUpload
          kind="HERO"
          assetId={design.heroAssetId}
          label="Hintergrundbild"
          hint="Zuschnitt 1032 × 336 (3:1) · leicht abgedunkelt"
          aspect={1032 / 336}
          previewClassName="h-12 w-24"
          cropTitle="Hintergrundbild zuschneiden"
          cropDescription="Google Wallet zeigt das Bild im Verhältnis 3:1. Apple Wallet nutzt einen deutlich schmaleren Ausschnitt."
          onUploaded={(asset) => patch({ heroAssetId: asset.id })}
          onCleared={() => patch({ heroAssetId: null })}
        />
      </PanelSection>
    </TabPanel>
  )
}
