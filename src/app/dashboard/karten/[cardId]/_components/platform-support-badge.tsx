'use client'

import { Info } from 'lucide-react'
import { Badge, Tooltip } from '@/components/ui/misc'
import { PLATFORM_SUPPORT, type SupportedField } from '@/lib/cards/platform-support'

/**
 * Tells the shop owner up front when a setting only lands on one of the two wallets.
 * Cheaper than the phone call three days after the campaign went out.
 */
export function PlatformSupportBadge({ field }: { field: SupportedField }) {
  const support = PLATFORM_SUPPORT[field]
  if (support.apple === 'full' && support.google === 'full') return null

  const tone = support.apple === 'none' || support.google === 'none' ? 'warn' : 'neutral'
  const label =
    support.google === 'none'
      ? 'Nur Apple'
      : support.apple === 'none'
        ? 'Nur Google'
        : 'Eingeschränkt'

  return (
    <Tooltip content={support.note}>
      <span className="inline-flex" tabIndex={0} data-slot="control">
        <Badge tone={tone}>
          <Info className="size-3" />
          {label}
        </Badge>
      </span>
    </Tooltip>
  )
}
