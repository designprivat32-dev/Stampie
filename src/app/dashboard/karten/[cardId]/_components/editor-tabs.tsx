'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AdvancedTab } from './tabs/advanced-tab'
import { BrandingTab } from './tabs/branding-tab'
import { CouponTab } from './tabs/coupon-tab'
import { ProgramTab } from './tabs/program-tab'
import { TextsTab } from './tabs/texts-tab'
import { useCardEditor } from '@/stores/card-editor-provider'
import type { CustomerSummary } from '@/types/customer'

/**
 * Which tabs exist depends on the card kind, and the rule is not cosmetic: a tab is shown
 * only when the fields inside it reach the pass being built.
 *
 * A coupon has no stamps, so that tab is absent rather than empty. The Google Wallet tab is
 * absent too — every field in it (`accountName`, `accountId`, `rewardsTier` and their
 * labels) belongs to `LoyaltyClass`; `buildOfferClass` reads none of them, so on a coupon
 * they are controls that change nothing.
 *
 * Both kinds reach the coupon editor, because a stamp card can hand one out as its reward.
 */
export function EditorTabs({ customer }: { customer: CustomerSummary }) {
  const kind = useCardEditor((s) => s.kind)
  const isStamp = kind === 'STAMP'

  return (
    <Tabs defaultValue="branding" className="flex h-full min-h-0 flex-col">
      <TabsList className="shrink-0 bg-surface">
        <TabsTrigger value="branding">Branding</TabsTrigger>
        {isStamp ? <TabsTrigger value="program">Stempel</TabsTrigger> : null}
        <TabsTrigger value="coupon">Gutschein</TabsTrigger>
        <TabsTrigger value="texts">Texte</TabsTrigger>
        <TabsTrigger value="advanced">Erweitert</TabsTrigger>
      </TabsList>

      <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto">
        <TabsContent value="branding">
          <BrandingTab />
        </TabsContent>
        {isStamp ? (
          <TabsContent value="program">
            <ProgramTab />
          </TabsContent>
        ) : null}
        <TabsContent value="coupon">
          <CouponTab />
        </TabsContent>
        <TabsContent value="texts">
          <TextsTab customer={customer} />
        </TabsContent>
        <TabsContent value="advanced">
          <AdvancedTab customer={customer} />
        </TabsContent>
      </div>
    </Tabs>
  )
}
