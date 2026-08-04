'use client'

import { StampStripImg } from './stamp-strip-img'
import { stripPreviewUrl } from '@/lib/cards/preview-url'
import { readableOn } from '@/lib/color/contrast'
import type { CardDesignInput } from '@/lib/cards/schema'

/**
 * Pixel-near rebuild of a Google Wallet loyalty card.
 *
 * Differences from Apple that the shop owner needs to see rather than be told about:
 * Google derives the text colour itself (foreground/label colour are ignored), the hero
 * image is 3:1, and — the one that surprises everyone — the barcode comes *before* the
 * stamp row. Google fixes that order and offers no field to change it, so the preview
 * copies it rather than showing a nicer layout the real card will never have.
 */
export function GoogleLoyaltyCard({
  design,
  cardId,
  currentStamps,
  logoUrl,
  organizationName,
}: {
  design: CardDesignInput
  cardId: string
  currentStamps: number
  logoUrl: string | null
  organizationName: string
}) {
  const heroSrc = stripPreviewUrl(design, { cardId, currentStamps, target: 'google', scale: 1 })
  // Google picks the text colour from the background — mirror that, do not use fg/label.
  const ink = readableOn(design.backgroundColor)
  const muted = ink === '#ffffff' ? 'rgba(255,255,255,0.72)' : 'rgba(0,0,0,0.6)'

  return (
    <div
      className="w-[336px] overflow-hidden rounded-[14px] shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
      style={{ backgroundColor: design.backgroundColor, color: ink }}
    >
      <div className="flex items-start gap-2.5 px-4 pb-3 pt-4">
        <div
          className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full"
          style={{ backgroundColor: ink === '#ffffff' ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)' }}
        >
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="size-full object-contain p-1" />
          ) : (
            <span className="text-[12px] font-semibold">{organizationName.slice(0, 1) || 'S'}</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px]" style={{ color: muted }}>
            {organizationName}
          </div>
          <div className="truncate text-[14px] font-medium leading-tight">
            {design.programName.trim() || 'Stempelkarte'}
          </div>
        </div>
      </div>

      <div className="px-4 pb-3">
        <div className="text-[11px] uppercase tracking-[0.05em]" style={{ color: muted }}>
          {design.stampLabel}
        </div>
        <div className="text-[26px] font-normal leading-tight tabular-nums">
          {currentStamps}
          <span className="text-[16px]" style={{ color: muted }}>
            {' '}
            / {design.stampGoal}
          </span>
        </div>
      </div>



      <div className="p-4">
        <div className="flex flex-col items-center rounded-lg bg-white px-4 py-3">
          <svg viewBox="0 0 21 21" className="size-[96px]" aria-hidden="true">
            {GOOGLE_QR_CELLS.map(([x, y]) => (
              <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="black" />
            ))}
          </svg>
          <span className="mt-1.5 text-[9px] tracking-widest text-black/55">SN-DEMO-0001</span>
        </div>
      </div>

      {/* Below the barcode — Google's order, not ours. */}
      <StampStripImg src={heroSrc} alt="Stempelreihe" aspect={1032 / 336} />

      {design.rewardText.trim() ? (
        <div className="px-4 pb-4 pt-3">
          <div className="text-[11px] uppercase tracking-[0.05em]" style={{ color: muted }}>
            Belohnung
          </div>
          <div className="text-[13px] leading-snug">{design.rewardText.trim()}</div>
        </div>
      ) : null}
    </div>
  )
}

const GOOGLE_QR_CELLS: ReadonlyArray<readonly [number, number]> = (() => {
  const cells: Array<[number, number]> = []
  const finder = (ox: number, oy: number) => {
    for (let x = 0; x < 7; x++) {
      for (let y = 0; y < 7; y++) {
        const edge = x === 0 || x === 6 || y === 0 || y === 6
        const core = x >= 2 && x <= 4 && y >= 2 && y <= 4
        if (edge || core) cells.push([ox + x, oy + y])
      }
    }
  }
  finder(0, 0)
  finder(14, 0)
  finder(0, 14)
  let seed = 19
  for (let x = 0; x < 21; x++) {
    for (let y = 0; y < 21; y++) {
      if ((x < 8 && y < 8) || (x > 12 && y < 8) || (x < 8 && y > 12)) continue
      seed = (seed * 1103515245 + 12345) % 2147483648
      if (seed % 100 < 44) cells.push([x, y])
    }
  }
  return cells
})()
