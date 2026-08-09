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

      {/* Google Wallet optional: rewards tier. Gated on the live value, not the debounced
          `design` prop, so the input does not vanish mid-edit while the user is typing it
          out from empty. */}
      {live.googleRewardsTierEnabled && live.rewardsTier ? (
        <div className="px-4 pb-2">
          <div className="flex items-center gap-2">
            {live.rewardsTierLabel ? (
              <span className="text-[11px] uppercase tracking-[0.05em]" style={{ color: muted }}>
                <EditableField
                  value={live.rewardsTierLabel ?? ''}
                  onCommit={(v) => patch({ rewardsTierLabel: v || null })}
                  placeholder="Stufe"
                  maxLength={9}
                  tone={tone}
                  ariaLabel="Label für Stufe"
                />
              </span>
            ) : null}
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[12px] font-medium">
              <EditableField
                value={live.rewardsTier ?? ''}
                onCommit={(v) => patch({ rewardsTier: v || null })}
                placeholder="Gold"
                maxLength={7}
                tone={tone}
                ariaLabel="Stufen-Name"
              />
            </span>
          </div>
        </div>
      ) : null}

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
        <div className="text-[26px] font-normal leading-tight tabular-nums">
          {currentStamps}
          <span className="text-[16px]" style={{ color: muted }}>
            {' '}
            / {design.stampGoal}
          </span>
        </div>
      </div>

      {/* Google Wallet optional: account name labels — gated on the live value, see above. */}
      {(live.accountNameLabel || live.accountIdLabel) ? (
        <div className="flex gap-4 px-4 pb-3">
          {live.accountNameLabel ? (
            <div>
              <div className="text-[11px] uppercase tracking-[0.05em]" style={{ color: muted }}>
                <EditableField
                  value={live.accountNameLabel ?? ''}
                  onCommit={(v) => patch({ accountNameLabel: v || null })}
                  placeholder="Mitglied"
                  maxLength={15}
                  tone={tone}
                  ariaLabel="Label für Kontoinhaber"
                />
              </div>
              <div className="text-[13px]">—</div>
            </div>
          ) : null}
          {live.accountIdLabel ? (
            <div>
              <div className="text-[11px] uppercase tracking-[0.05em]" style={{ color: muted }}>
                <EditableField
                  value={live.accountIdLabel ?? ''}
                  onCommit={(v) => patch({ accountIdLabel: v || null })}
                  placeholder="Nr."
                  maxLength={15}
                  tone={tone}
                  ariaLabel="Label für ID"
                />
              </div>
              <div className="text-[13px]">—</div>
            </div>
          ) : null}
        </div>
      ) : null}

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

      {live.rewardText.trim() ? (
        <div className="px-4 pb-4 pt-3">
          <div className="text-[11px] uppercase tracking-[0.05em]" style={{ color: muted }}>
            Belohnung
          </div>
          <div className="text-[13px] leading-snug">
            <EditableField
              value={live.rewardText}
              onCommit={(v) => patch({ rewardText: v })}
              placeholder="Belohnungstext"
              maxLength={80}
              tone={tone}
              ariaLabel="Belohnungstext"
              truncate={false}
            />
          </div>
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
