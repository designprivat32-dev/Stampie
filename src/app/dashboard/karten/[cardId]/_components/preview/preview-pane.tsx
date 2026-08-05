'use client'

import * as React from 'react'
import { toPng } from 'html-to-image'
import { AppleStoreCard } from './apple-store-card'
import { AppleStoreCardBack } from './apple-store-card-back'
import { GoogleLoyaltyCard } from './google-loyalty-card'
import { GoogleLoyaltyCardBack } from './google-loyalty-card-back'
import { PreviewControls } from './preview-controls'
import { useCardEditor } from '@/stores/card-editor-provider'
import { useDebounced } from '@/hooks/use-debounced'
import { walletLogoUrl } from '@/lib/wallet/image-urls'

/**
 * The right-hand stage. Everything here reacts to a 150 ms debounced copy of the design,
 * so typing in the editor does not fire a render per keystroke.
 */
export function PreviewPane({
  cardId,
  organizationName,
}: {
  cardId: string
  organizationName: string
}) {
  const liveDesign = useCardEditor((s) => s.design)
  const design = useDebounced(liveDesign, 150)

  const platform = useCardEditor((s) => s.previewPlatform)
  const side = useCardEditor((s) => s.previewSide)
  const theme = useCardEditor((s) => s.previewTheme)
  const simulatedStamps = useCardEditor((s) => s.simulatedStamps)
  const assetUrls = useCardEditor((s) => s.assetUrls)

  const cardRef = React.useRef<HTMLDivElement>(null)
  const logoUrl = design.logoAssetId ? (assetUrls[design.logoAssetId] ?? null) : null
  // Google gets the *rendered* logo, not the raw upload: the renderer trims the file's
  // empty margin and fills the circle. Showing the raw asset here would put a preview on
  // screen that the real card never matches.
  const googleLogoUrl = walletLogoUrl('', cardId, design)
  const stamps = Math.min(simulatedStamps, design.stampGoal)

  const handleExport = React.useCallback(async () => {
    const node = cardRef.current
    if (!node) throw new Error('nothing to export')

    const dataUrl = await toPng(node, {
      pixelRatio: 2,
      cacheBust: false,
      backgroundColor: theme === 'dark' ? '#2b2b2b' : '#ededed',
    })

    const link = document.createElement('a')
    link.download = `stempelkarte-${platform}-${side}.png`
    link.href = dataUrl
    link.click()
  }, [platform, side, theme])

  return (
    <div className="flex h-full flex-col items-center gap-3 py-4">
      <div
        className="preview-stage scrollbar-slim flex w-full flex-1 items-center justify-center overflow-y-auto rounded-xl border border-line p-3"
        data-theme={theme}
      >
        <div ref={cardRef} className="p-2">
          {platform === 'apple' ? (
            side === 'front' ? (
              <AppleStoreCard
                design={design}
                cardId={cardId}
                currentStamps={stamps}
                logoUrl={logoUrl}
                organizationName={organizationName}
              />
            ) : (
              <AppleStoreCardBack design={design} />
            )
          ) : side === 'front' ? (
            <GoogleLoyaltyCard
              design={design}
              cardId={cardId}
              currentStamps={stamps}
              logoUrl={googleLogoUrl}
              organizationName={organizationName}
            />
          ) : (
            <GoogleLoyaltyCardBack design={design} />
          )}
        </div>
      </div>

      <PreviewControls onExport={handleExport} />
    </div>
  )
}
