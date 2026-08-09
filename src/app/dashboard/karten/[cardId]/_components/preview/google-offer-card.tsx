'use client'

import { EditableField } from './editable-field'
import { readableOn } from '@/lib/color/contrast'
import { useCardEditor } from '@/stores/card-editor-provider'
import type { CardDesignInput } from '@/lib/cards/schema'

/**
 * Google Wallet offer card — the face of a `CardKind.COUPON` pass.
 *
 * Same house rules as the loyalty card: Google derives the text colour from the background,
 * and only the fields Google actually renders on the face appear here. `details` and
 * `finePrint` are deliberately absent — like `textModulesData` on a loyalty card, they show
 * up only once the customer expands the pass, and putting them here would promise the shop
 * owner something their customers never see.
 */
export function GoogleOfferCard({
  design,
  logoUrl,
  organizationName,
}: {
  design: CardDesignInput
  logoUrl: string | null
  organizationName: string
}) {
  const patch = useCardEditor((s) => s.patch)
  const live = useCardEditor((s) => s.design)

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
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="size-full object-contain" />
          ) : (
            <span className="text-[12px] font-semibold">{organizationName.slice(0, 1) || 'S'}</span>
          )}
        </div>

        <div className="min-w-0 flex-1 self-center">
          <div className="truncate text-[14px] font-medium leading-tight">
            <EditableField
              value={live.issuerDisplayName ?? ''}
              onCommit={(v) => patch({ issuerDisplayName: v || null })}
              placeholder={organizationName}
              maxLength={40}
              tone={tone}
              ariaLabel="Aussteller"
            />
          </div>
        </div>
      </div>

      {/* `title` is the offer — the one line Google sets large on an offer card. */}
      <div className="px-4 pb-4">
        <div className="text-[11px] uppercase tracking-[0.05em]" style={{ color: muted }}>
          Gutschein
        </div>
        <div className="mt-0.5 text-[22px] font-medium leading-tight">
          <EditableField
            value={live.offerTitle ?? ''}
            onCommit={(v) => patch({ offerTitle: v || null })}
            placeholder="20 % auf alles"
            maxLength={60}
            tone={tone}
            ariaLabel="Gutschein-Titel"
            truncate={false}
          />
        </div>
      </div>

      <div className="flex justify-center px-4 pb-4">
        <div className="flex flex-col items-center rounded-md bg-white p-3">
          <svg viewBox="0 0 21 21" className="size-[152px]" aria-hidden="true">
            {OFFER_QR_CELLS.map(([x, y]) => (
              <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="black" />
            ))}
          </svg>
          <span className="mt-1 text-[10px] text-black/60">SN-DEMO-0001</span>
        </div>
      </div>
    </div>
  )
}

const OFFER_QR_CELLS: ReadonlyArray<readonly [number, number]> = (() => {
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
  let seed = 31
  for (let x = 0; x < 21; x++) {
    for (let y = 0; y < 21; y++) {
      if ((x < 8 && y < 8) || (x > 12 && y < 8) || (x < 8 && y > 12)) continue
      seed = (seed * 1103515245 + 12345) % 2147483648
      if (seed % 100 < 44) cells.push([x, y])
    }
  }
  return cells
})()
