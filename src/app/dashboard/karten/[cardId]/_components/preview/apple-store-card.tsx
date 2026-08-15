'use client'

import * as React from 'react'
import { StampStripImg } from './stamp-strip-img'
import { resolveIssuerName } from '@/lib/cards/issuer'
import { BarcodePlaceholder } from './barcode-placeholder'
import { stripPreviewUrl } from '@/lib/cards/preview-url'
import type { CardDesignInput } from '@/lib/cards/schema'

/**
 * Pixel-near rebuild of an Apple Wallet `storeCard`.
 *
 * Only the *chrome* is rebuilt here — the stamp row itself comes from the server
 * renderer, so the preview cannot drift from the real pass.
 *
 * Layout follows PassKit: header fields top-right, strip full-bleed under it,
 * secondary/auxiliary fields below, barcode at the bottom on a white plate.
 */

export interface AppleCardProps {
  design: CardDesignInput
  cardId: string
  currentStamps: number
  logoUrl: string | null
  organizationName: string
}

export function AppleStoreCard({
  design,
  cardId,
  currentStamps,
  logoUrl,
  organizationName,
}: AppleCardProps) {
  const stripSrc = stripPreviewUrl(design, { cardId, currentStamps, target: 'apple', scale: 2 })

  const secondary = [
    design.rewardText.trim() ? { label: 'BELOHNUNG', value: design.rewardText.trim() } : null,
    design.programName.trim() ? { label: 'PROGRAMM', value: design.programName.trim() } : null,
  ].filter((f): f is { label: string; value: string } => f !== null)

  return (
    <div
      className="w-[336px] overflow-hidden rounded-[10px] shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
      style={{ backgroundColor: design.backgroundColor, color: design.foregroundColor }}
    >
      {/* header */}
      <div className="flex items-center justify-between gap-3 px-3.5 pb-2 pt-3">
        <div className="flex min-w-0 items-center gap-2">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt=""
              className="h-[26px] w-auto max-w-[110px] object-contain object-left"
            />
          ) : (
            <span
              className="truncate text-[13px] font-semibold leading-tight"
              style={{ color: design.foregroundColor }}
            >
              {resolveIssuerName(design, organizationName)}
            </span>
          )}
          {design.cardTitle?.trim() ? (
            <span className="truncate text-[12px] opacity-80">{design.cardTitle.trim()}</span>
          ) : null}
        </div>

        <div className="shrink-0 text-right leading-none">
          <div
            className="text-[9px] font-medium uppercase tracking-[0.06em]"
            style={{ color: design.labelColor }}
          >
            {design.stampLabel}
          </div>
          <div className="mt-1 text-[17px] font-semibold tabular-nums">
            {currentStamps}/{design.stampGoal}
          </div>
        </div>
      </div>

      {/* strip — the only part that is a server-rendered image */}
      <StampStripImg src={stripSrc} alt="Stempelreihe" aspect={375 / 123} />

      {/* secondary fields */}
      {secondary.length > 0 ? (
        <div className="flex gap-6 px-3.5 pb-1 pt-3">
          {secondary.map((f) => (
            <div key={f.label} className="min-w-0 flex-1">
              <div
                className="text-[9px] font-medium uppercase tracking-[0.06em]"
                style={{ color: design.labelColor }}
              >
                {f.label}
              </div>
              <div className="truncate text-[13px] font-medium">{f.value}</div>
            </div>
          ))}
        </div>
      ) : null}

      {/* barcode */}
      <div className="px-3.5 pb-3.5 pt-3">
        <div className="mx-auto flex w-[132px] flex-col items-center rounded-md bg-white p-2">
          <BarcodePlaceholder format={design.barcodeFormat} />
          <span className="mt-1 text-[8px] tracking-widest text-black/60">SN-DEMO-0001</span>
        </div>
      </div>
    </div>
  )
}
