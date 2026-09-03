'use client'

import { EditableField } from './editable-field'
import { StampStripImg } from './stamp-strip-img'
import { stripPreviewUrl } from '@/lib/cards/preview-url'
import { readableOn } from '@/lib/color/contrast'
import type { CardDesignInput } from '@/lib/cards/schema'
import { useCardEditor } from '@/stores/card-editor-provider'

/**
 * Rebuild of a Google Wallet loyalty card *face*, checked field by field against an
 * installed pass rather than against the layout docs — the two disagree, and the device
 * wins. What actually renders here, in order:
 *
 *   programLogo · issuerName · loyaltyPoints (label + balance) · barcode + alternateText ·
 *   heroImage
 *
 * Everything else the class carries — `programName`, `accountName`, `accountId`,
 * `rewardsTier`, `textModulesData`, `linksModuleData` — only appears once the customer
 * expands the card, so it lives in `GoogleLoyaltyCardBack`. Putting any of it here would
 * promise the shop owner something their customers never see, which is exactly the bug
 * this layout was rewritten to fix.
 *
 * Two more Google quirks the preview copies rather than improves on: the text colour is
 * derived from the background (foreground/label colour are ignored), and the barcode sits
 * *above* the hero image with no field to reorder it.
 *
 * Text is click-to-edit directly on the card, like Google's own Pass Builder — no detour
 * through the sidebar. Editable fields read and write the store live (not the debounced
 * `design` prop) so a keystroke lands immediately.
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

        {/*
          Header is `issuerName` and nothing else. Google's template docs list `programName`
          here too, but on a real device it never shows up on the card face — verified
          against an installed pass. `programName` still matters: it names the pass in the
          Wallet list and in search, so it stays in the editor, just not on this face.
        */}
        <div className="min-w-0 flex-1 self-center">
          <div className="text-[14px] font-medium leading-tight">
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

      {/*
        `loyaltyPoints`: label plus balance, nothing else. `buildLoyaltyObject` sends
        `balance: { string: "6/10" }`, so das Telefon druckt Stand *und* Ziel — genau wie
        Apple es in der Kopfzeile hat. Hier steht dieselbe Rechnung, sonst zeigt die
        Vorschau dem Betrieb etwas anderes als die Karte im Wallet des Kunden.
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
        <div className="text-[26px] font-normal leading-tight tabular-nums">
          {Math.max(0, Math.min(live.stampGoal, currentStamps))}/{live.stampGoal}
        </div>
      </div>

      {/*
        No rewards tier and no account name/id here: Google's default loyalty template puts
        `rewardsTier`, `accountName` and `accountId` in the expanded details view, not on the
        card face. They live in `GoogleLoyaltyCardBack`.
      */}

      {/*
        White box hugs the code — Google leaves only a quiet-zone margin, not the padded
        card we had before. The line underneath is `barcode.alternateText`, which
        `buildLoyaltyObject` fills with the serial so staff can key it in when a scan fails;
        Google prints it, so the preview does too.
      */}
      <div className="flex justify-center px-4 pb-4">
        <div className="flex flex-col items-center rounded-md bg-white p-3">
          <svg viewBox="0 0 21 21" className="size-[152px]" aria-hidden="true">
            {GOOGLE_QR_CELLS.map(([x, y]) => (
              <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="black" />
            ))}
          </svg>
          <span className="mt-1 text-[10px] text-black/60">SN-DEMO-0001</span>
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
