'use client'

import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { BrandingBackground, BrandingEssentials } from './tabs/branding-tab'
import { ProgramAppearance, ProgramEssentials } from './tabs/program-tab'
import { CouponTab } from './tabs/coupon-tab'
import { TextsTab } from './tabs/texts-tab'
import { AdvancedTab } from './tabs/advanced-tab'
import { useCardEditor } from '@/stores/card-editor-provider'
import { cn } from '@/lib/utils'
import type { CustomerSummary } from '@/types/customer'

/**
 * One scrolling column instead of five tabs.
 *
 * Tabs hid the order of work: publishing refuses without a programme name, a reward, an
 * icon, enough contrast and the two legal links — and those sat spread across three tabs
 * with nothing saying which mattered. Here they come first, in that order, and everything
 * that only changes how the card looks follows underneath.
 *
 * "Erweitert" stays collapsed. Barcode format, location alerts, expiry and sharing are
 * settings a shop touches once a year, and they were taking up a tab of their own.
 */
export function EditorPanel({ customer }: { customer: CustomerSummary }) {
  const isStamp = useCardEditor((s) => s.kind === 'STAMP')

  return (
    <div className="divide-y divide-line">
      <Group title="Pflichtangaben" hint="Ohne diese Angaben ist Veröffentlichen gesperrt.">
        <TextsTab customer={customer} />
        {isStamp ? <ProgramEssentials /> : null}
        <BrandingEssentials />
      </Group>

      <Group title="Gestaltung" hint="Wie die Karte aussieht. Alles davon ist freiwillig.">
        {isStamp ? <ProgramAppearance /> : null}
        <BrandingBackground />
        <CouponTab />
      </Group>

      <Advanced>
        <AdvancedTab customer={customer} />
      </Advanced>
    </div>
  )
}

function Group({
  title,
  hint,
  children,
}: {
  title: string
  hint: string
  children: React.ReactNode
}) {
  return (
    <section className="px-4 py-5">
      <header className="mb-1">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-2">{title}</h2>
        <p className="text-[12px] leading-snug text-ink-3">{hint}</p>
      </header>
      {children}
    </section>
  )
}

/**
 * Collapsed by default and deliberately not remembered between visits: the whole point is
 * that these settings stay out of the way until someone goes looking for them.
 */
function Advanced({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)

  return (
    <section className="px-4 py-2">
      <button
        type="button"
        data-slot="control"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between py-3 text-left"
      >
        <span>
          <span className="block text-[13px] font-semibold uppercase tracking-wide text-ink-2">
            Erweitert
          </span>
          <span className="block text-[12px] text-ink-3">
            Barcode, Standort-Benachrichtigung, Gültigkeit, Teilen
          </span>
        </span>
        <ChevronDown
          className={cn('size-4 shrink-0 text-ink-3 transition-transform', open && 'rotate-180')}
        />
      </button>
      {open ? <div className="pb-4">{children}</div> : null}
    </section>
  )
}
