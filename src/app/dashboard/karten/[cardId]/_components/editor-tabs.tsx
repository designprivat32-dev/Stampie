'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AdvancedTab } from './tabs/advanced-tab'
import { BrandingTab } from './tabs/branding-tab'
import { GoogleWalletTab } from './tabs/google-wallet-tab'
import { ProgramTab } from './tabs/program-tab'
import { TextsTab } from './tabs/texts-tab'
import type { LocationSummary } from '@/types/location'

export function EditorTabs({ location }: { location: LocationSummary }) {
  return (
    <Tabs defaultValue="branding" className="flex h-full min-h-0 flex-col">
      <TabsList className="shrink-0 bg-surface">
        <TabsTrigger value="branding">Branding</TabsTrigger>
        <TabsTrigger value="program">Stempel</TabsTrigger>
        <TabsTrigger value="texts">Texte</TabsTrigger>
        <TabsTrigger value="google">Google Wallet</TabsTrigger>
        <TabsTrigger value="advanced">Erweitert</TabsTrigger>
      </TabsList>

      <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto">
        <TabsContent value="branding">
          <BrandingTab />
        </TabsContent>
        <TabsContent value="program">
          <ProgramTab />
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
