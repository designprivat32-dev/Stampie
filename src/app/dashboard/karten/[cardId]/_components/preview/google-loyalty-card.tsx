'use client'

import { EditableField } from './editable-field'
import { StampStripImg } from './stamp-strip-img'
import { stripPreviewUrl } from '@/lib/cards/preview-url'
import { readableOn } from '@/lib/color/contrast'
import type { CardDesignInput } from '@/lib/cards/schema'
import { useCardEditor } from '@/stores/card-editor-provider'

/**
 * Pixel-near rebuild of a Google Wallet loyalty card.
 *
 * Differences from Apple that the shop owner needs to see rather than be told about:
 * Google derives the text colour itself (foreground/label colour are ignored), the hero
 * image is 3:1, and — the one that surprises everyone — the barcode comes *before* the
 * stamp row. Google fixes that order and offers no field to change it, so the preview
 * copies it rather than showing a nicer layout the real card will never have.
 *
 * Text fields are click-to-edit directly on the card, the same way Google's own Pass
 * Builder works — no detour through the sidebar. They read and write the store live
 * (not the debounced `design` prop) so a keystroke lands on the card immediately.
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
  const patch = useCardEditor((s) => s.patch)
  const live = useCardEditor((s) => s.design)
  const heroSrc = stripPreviewUrl(design, { cardId, currentStamps, target: 'google', scale: 1 })
  // Google picks the text colour from the background — mirror that, do not use fg/label.
  const ink = readableOn(design.backgroundColor)
  const tone: 'light' | 'dark' = ink === '#ffffff' ? 'light' : 'dark'
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
            // The rendered logo has a transparent surround and carries its own inset, so
            // it is shown whole. `object-cover` would crop a mark that is wider than tall.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="size-full object-contain" />
          ) : (
            <span className="text-[12px] font-semibold">{organizationName.slice(0, 1) || 'S'}</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px]" style={{ color: muted }}>
            {organizationName}
          </div>
          <div className="text-[14px] font-medium leading-tight">
            <EditableField
              value={live.programName}
              onCommit={(v) => patch({ programName: v })}
              placeholder="Stempelkarte"
              maxLength={30}
              tone={tone}
              ariaLabel="Programmname"
            />
          </div>
        </div>
      </div>

      {/*
        `loyaltyPoints`: label plus balance, nothing else. The goal is deliberately absent —
        `buildLoyaltyObject` sends `balance: { int: stamps }`, so the phone prints "6", never
        "6 / 10". The goal is only visible through the filled/empty stamps in the hero image.
      */}
      <div className="px-4 pb-3">
        <div className="text-[11px] uppercase tracking-[0.05em]" style={{ color: muted }}>
          <EditableField
            value={live.stampLabel}
            onCommit={(v) => patch({ stampLabel: v })}
            placeholder="Stempel"
            maxLength={16}
            tone={tone}
            ariaLabel="Stempel-Bezeichnung"
          />
        </div>
        <div className="text-[26px] font-normal leading-tight tabular-nums">{currentStamps}</div>
      </div>

      {/*
        No rewards tier and no account name/id here: Google's default loyalty template puts
        `rewardsTier`, `accountName` and `accountId` in the expanded details view, not on the
        card face. They live in `GoogleLoyaltyCardBack`.
      */}

      {/*
        Google renders the barcode in a white box sized close to the code itself — not the
        padded card-with-caption we had before. It also does not print the serial number
        next to it on the front face; that only shows up if the scan fails and staff needs
        to key the code in by hand, which is what `barcode.alternateText` is for, not a
        front-of-card label.
      */}
      <div className="flex justify-center px-4 pb-4">
        <div className="flex items-center justify-center rounded-md bg-white p-3">
          <svg viewBox="0 0 21 21" className="size-[152px]" aria-hidden="true">
            {GOOGLE_QR_CELLS.map(([x, y]) => (
              <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="black" />
            ))}
          </svg>
        </div>
      </div>

      {/* Below the barcode — Google's order, not ours. */}
      <StampStripImg src={heroSrc} alt="Stempelreihe" aspect={1032 / 336} />

      {/*
        No reward-text block here on purpose: `rewardText` maps to `textModulesData`, and
        Google only renders that in the card's expanded "Details" view, never inline on the
        front face. `GoogleLoyaltyCardBack` already shows it there — repeating it here would
        show something on the front the phone never actually displays.
      */}
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
