'use client'

import * as React from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PanelSection, Spinner } from '@/components/ui/misc'
import { AssetUpload } from '../asset-upload'
import { ColorField, PaletteRow } from '../color-field'
import { ContrastWarning } from '../contrast-warning'
import { PlatformSupportBadge } from '../platform-support-badge'
import { deriveIconAction } from '@/actions/assets'
import { isSupportedOn } from '@/lib/cards/platform-support'
import { useCardEditor } from '@/stores/card-editor-provider'
import type { PaletteSuggestion } from '@/lib/color/extract-palette'

export function BrandingTab() {
  const cardId = useCardEditor((s) => s.cardId)
  const design = useCardEditor((s) => s.design)
  const patch = useCardEditor((s) => s.patch)
  const setAssetUrl = useCardEditor((s) => s.setAssetUrl)
  const isStamp = useCardEditor((s) => s.kind === 'STAMP')
  // The preview switch decides which wallet's settings are on screen.
  const platform = useCardEditor((s) => s.previewPlatform)

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
    <div>
      <PanelSection title="Logo & Icon">
        <div className="space-y-3">
          <AssetUpload
            kind="LOGO"
            assetId={design.logoAssetId}
            label="Logo"
            hint="PNG, JPG, SVG · max. 5 MB · 160 × 50"
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

          {/*
            Only what the previewed wallet actually uses. Google ignores the icon, Apple
            ignores the square logo — showing both at once next to one card was half clutter.
          */}
          {isSupportedOn('squareLogo', platform) ? (
            <AssetUpload
              kind="SQUARE_LOGO"
              assetId={design.squareLogoAssetId}
              label="Quadratisches Logo"
              hint="660 × 660 · rund beschnitten · am besten transparent"
              aspect={1}
              previewClassName="size-12"
              cropTitle="Quadratisches Logo zuschneiden"
              cropDescription="Google Wallet zeigt das Logo als Kreis. Alles außerhalb des Kreises wird abgeschnitten — wichtige Bildteile also mittig halten."
              onUploaded={(asset) => patch({ squareLogoAssetId: asset.id })}
              onCleared={() => patch({ squareLogoAssetId: null })}
            />
          ) : null}

          {isSupportedOn('icon', platform) ? (
            <AssetUpload
              kind="ICON"
              assetId={design.iconAssetId}
              label="Icon (29 × 29)"
              hint="Pflicht für Apple Wallet"
              aspect={1}
              previewClassName="size-12"
              cropTitle="Icon zuschneiden"
              cropDescription="Quadratisch. Erscheint in Benachrichtigungen und auf dem Sperrbildschirm."
              onUploaded={(asset) => patch({ iconAssetId: asset.id })}
              onCleared={() => patch({ iconAssetId: null })}
            />
          ) : null}

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

          {!design.iconAssetId && isSupportedOn('icon', platform) ? (
            <p className="rounded-md border border-warn/40 bg-warn-soft px-3 py-2 text-[12px] leading-snug text-warn-ink">
              Ohne Icon ist Veröffentlichen gesperrt.
            </p>
          ) : null}
        </div>
      </PanelSection>

      <PanelSection title="Farben">
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
          />
          {/* Google derives both from the background — nothing to set while it is previewed. */}
          {isSupportedOn('foregroundColor', platform) ? (
            <ColorField
              id="foreground-color"
              label="Textfarbe"
              value={design.foregroundColor}
              onChange={(foregroundColor) => patch({ foregroundColor })}
            />
          ) : null}
          {isSupportedOn('labelColor', platform) ? (
            <ColorField
              id="label-color"
              label="Labelfarbe"
              value={design.labelColor}
              onChange={(labelColor) => patch({ labelColor })}
            />
          ) : null}

          {isSupportedOn('foregroundColor', platform) ? <ContrastWarning /> : null}
        </div>
      </PanelSection>

      {/*
        The background image is composited *into* the stamp strip by the renderer, so it
        has nowhere to go on a coupon — that pass carries no strip at all.
      */}
      {isStamp ? (
        <PanelSection title="Hintergrundbild" action={<PlatformSupportBadge field="hero" />}>
          <AssetUpload
            kind="HERO"
            assetId={design.heroAssetId}
            label="Hintergrundbild"
            hint="Optional · 1032 × 336 (3:1) · hinter der Stempelreihe"
            aspect={1032 / 336}
            previewClassName="h-12 w-24"
            cropTitle="Hintergrundbild zuschneiden"
            cropDescription="Google Wallet zeigt das Bild im Verhältnis 3:1. Apple Wallet nutzt einen deutlich schmaleren Ausschnitt."
            onUploaded={(asset) => patch({ heroAssetId: asset.id })}
            onCleared={() => patch({ heroAssetId: null })}
          />
        </PanelSection>
      ) : null}
    </div>
  )
}
