'use client'

import * as React from 'react'
import { ChevronDown, LayoutTemplate } from 'lucide-react'
import { BrandingBackground, BrandingEssentials } from './tabs/branding-tab'
import { ProgramAppearance, ProgramEssentials } from './tabs/program-tab'
import { CouponTab } from './tabs/coupon-tab'
import { TextsTab } from './tabs/texts-tab'
import { AdvancedTab } from './tabs/advanced-tab'
import { Button } from '@/components/ui/button'
import { InfoHint, PanelSection } from '@/components/ui/misc'
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
export function EditorPanel({
  customer,
  onOpenTemplates,
}: {
  customer: CustomerSummary
  /** Opens the template picker, which the shell owns because it also opens on its own. */
  onOpenTemplates: () => void
}) {
  const isStamp = useCardEditor((s) => s.kind === 'STAMP')

  return (
    <div className="divide-y divide-line">
      <Group title="Pflichtangaben" hint="Ohne diese Angaben bleibt Veröffentlichen gesperrt.">
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
        {/*
          Templates overwrite colours, symbol and texts in one go. That belongs with the
          settings you reach for deliberately, not next to the fields it would overwrite.
          Only for stamp cards — a template carries a stamp goal and a reward.
        */}
        {isStamp ? (
          <PanelSection
            title="Vorlage"
            description="Setzt Farben, Symbol und Texte neu. Logo, Rückseite und Standorte bleiben."
          >
            <Button variant="secondary" size="sm" onClick={onOpenTemplates}>
              <LayoutTemplate />
              Vorlage wählen
            </Button>
          </PanelSection>
        ) : null}
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
      <header className="mb-1 flex items-center gap-1.5">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-2">{title}</h2>
        <InfoHint>{hint}</InfoHint>
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
        <span className="text-[13px] font-semibold uppercase tracking-wide text-ink-2">
          Erweitert
        </span>
        <ChevronDown
          className={cn('size-4 shrink-0 text-ink-3 transition-transform', open && 'rotate-180')}
        />
      </button>
      {open ? <div className="pb-4">{children}</div> : null}
    </section>
  )
}
