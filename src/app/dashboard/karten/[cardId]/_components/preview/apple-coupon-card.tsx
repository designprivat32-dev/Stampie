'use client'

import { resolveIssuerName } from '@/lib/cards/issuer'
import { BarcodePlaceholder } from './barcode-placeholder'
import type { CardDesignInput } from '@/lib/cards/schema'

/**
 * Apple Wallet `coupon` — the face of a `CardKind.COUPON` pass.
 *
 * Unlike a `storeCard`, the coupon style shows `primaryFields`, so the offer title is the
 * large line rather than being hidden behind a strip image. No stamp row exists on a
 * coupon, which is why there is no server-rendered image here at all.
 */
export function AppleCouponCard({
  design,
  logoUrl,
  organizationName,
}: {
  design: CardDesignInput
  logoUrl: string | null
  organizationName: string
}) {
  return (
    <div
      className="w-[336px] overflow-hidden rounded-[10px] shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
      style={{ backgroundColor: design.backgroundColor, color: design.foregroundColor }}
    >
      <div className="flex items-center gap-2 px-3.5 pb-2 pt-3">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="h-[26px] w-auto max-w-[110px] object-contain object-left" />
        ) : (
          <span className="truncate text-[13px] font-semibold leading-tight">
            {resolveIssuerName(design, organizationName)}
          </span>
        )}
        {design.cardTitle?.trim() ? (
          <span className="truncate text-[12px] opacity-80">{design.cardTitle.trim()}</span>
        ) : null}
      </div>

      {/* primaryFields — on a coupon this is the line Wallet sets largest. */}
      <div className="px-3.5 pb-2 pt-2">
        <div className="text-[22px] font-semibold leading-tight">
          {design.offerTitle?.trim() || '20 % auf alles'}
        </div>
      </div>

      {design.offerDetails?.trim() ? (
        <div className="px-3.5 pb-1">
          <div className="text-[13px] leading-snug opacity-90">{design.offerDetails.trim()}</div>
        </div>
      ) : null}

      <div className="px-3.5 pb-3.5 pt-3">
        <div className="mx-auto flex w-[132px] flex-col items-center rounded-md bg-white p-2">
          <BarcodePlaceholder format={design.barcodeFormat} />
          <span className="mt-1 text-[8px] tracking-widest text-black/60">SN-DEMO-0001</span>
        </div>
      </div>
    </div>
  )
}
