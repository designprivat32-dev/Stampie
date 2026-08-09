'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AdvancedTab } from './tabs/advanced-tab'
import { BrandingTab } from './tabs/branding-tab'
import { CouponTab } from './tabs/coupon-tab'
import { GoogleWalletTab } from './tabs/google-wallet-tab'
import { ProgramTab } from './tabs/program-tab'
import { TextsTab } from './tabs/texts-tab'
import type { CardKind } from '@/lib/cards/schema'
import type { LocationSummary } from '@/types/location'

/**
 * A coupon has no stamps, so that tab is not merely empty for it — it is absent. Both kinds
 * reach the coupon editor, because a stamp card can hand one out as its reward.
 */
export function EditorTabs({ location, kind }: { location: LocationSummary; kind: CardKind }) {
  const isStamp = kind === 'STAMP'

  return (
    <Tabs defaultValue="branding" className="flex h-full min-h-0 flex-col">
      <TabsList className="shrink-0 bg-surface">
        <TabsTrigger value="branding">Branding</TabsTrigger>
        {isStamp ? <TabsTrigger value="program">Stempel</TabsTrigger> : null}
        <TabsTrigger value="coupon">Gutschein</TabsTrigger>
        <TabsTrigger value="texts">Texte</TabsTrigger>
        <TabsTrigger value="google">Google Wallet</TabsTrigger>
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
          <CouponTab kind={kind} />
        </TabsContent>
        <TabsContent value="texts">
          <TextsTab location={location} />
        </TabsContent>
        <TabsContent value="google">
          <GoogleWalletTab />
        </TabsContent>
        <TabsContent value="advanced">
          <AdvancedTab location={location} />
        </TabsContent>
      </div>
    </Tabs>
  )
}
