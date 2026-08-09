'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  ChevronDown,
  History,
  LayoutTemplate,
  QrCode,
  Redo2,
  Rocket,
  Smartphone,
  Undo2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, TooltipProvider } from '@/components/ui/misc'
import { EditorTabs } from './editor-tabs'
import { PreviewPane } from './preview/preview-pane'
import { SaveStatusIndicator } from './save-status-indicator'
import { PublishDialog } from './dialogs/publish-dialog'
import { TemplateDialog } from './dialogs/template-dialog'
import { TestCardDialog } from './dialogs/test-card-dialog'
import { VersionHistoryDialog } from './dialogs/version-history-dialog'
import { useAutosave } from '@/hooks/use-autosave'
import { useUndoShortcuts } from '@/hooks/use-undo-shortcuts'
import { useCardEditor, useTemporal } from '@/stores/card-editor-provider'
import type { CardKind } from '@/lib/cards/schema'
import type { LocationSummary } from '@/types/location'
import { cn } from '@/lib/utils'

/**
 * Two-column workspace: editor left (~420px, scrolls), preview right (sticky, centred on
 * a neutral grey stage).
 *
 * Below 1024px — the agency's iPad in portrait — the preview collapses into a sticky bar
 * at the top that expands on tap, so the editor keeps the full width.
 */
export function CardEditorShell({
  cardName,
  cardKind,
  location,
  userEmail,
  publishedVersion,
  suggestTemplate,
  canStamp,
}: {
  cardName: string
  /** Decides which tabs exist and which pass type the preview shows. */
  cardKind: CardKind
  location: LocationSummary
  userEmail: string
  publishedVersion: number | null
  /** Whether the template picker should greet the owner — true only on an untouched card. */
  suggestTemplate: boolean
  /** Agency accounts design but never book stamps, so they get no till link. */
  canStamp: boolean
}) {
  useAutosave()
  useUndoShortcuts()

  const cardId = useCardEditor((state) => state.cardId)

  const { canUndo, canRedo, undo, redo } = useTemporal()

  const [templateOpen, setTemplateOpen] = React.useState(suggestTemplate)
  const [testCardOpen, setTestCardOpen] = React.useState(false)
  const [publishOpen, setPublishOpen] = React.useState(false)
  const [versionsOpen, setVersionsOpen] = React.useState(false)
  const [mobilePreviewOpen, setMobilePreviewOpen] = React.useState(false)
  const [version, setVersion] = React.useState(publishedVersion)

  return (
    <TooltipProvider>
      <div className="flex min-h-dvh flex-col bg-canvas">
        <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <Link
                href="/dashboard/karten"
                className="shrink-0 rounded-md p-1 text-ink-3 hover:bg-surface-2 hover:text-ink"
                aria-label="Zurück zur Kartenübersicht"
                title="Zurück zur Kartenübersicht"
              >
                <ArrowLeft className="size-4" />
              </Link>
              <div className="min-w-0">
                <h1 className="truncate text-[15px] font-semibold text-ink">{cardName}</h1>
                <p className="truncate text-[12px] text-ink-3">
                  {location.organizationName}
                  {location.name !== location.organizationName ? ` · ${location.name}` : ''}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {version === null ? (
                <Badge tone="neutral">Entwurf</Badge>
              ) : (
                <Badge tone="ok">Veröffentlicht · v{version}</Badge>
              )}
              <SaveStatusIndicator />
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Rückgängig (Strg+Z)"
                title="Rückgängig (Strg+Z)"
                disabled={!canUndo}
                onClick={undo}
              >
                <Undo2 />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Wiederherstellen (Strg+Umschalt+Z)"
                title="Wiederherstellen (Strg+Umschalt+Z)"
                disabled={!canRedo}
                onClick={redo}
              >
                <Redo2 />
              </Button>

              <Button variant="ghost" size="sm" onClick={() => setTemplateOpen(true)}>
                <LayoutTemplate />
                Vorlagen
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setVersionsOpen(true)}>
                <History />
                Versionen
              </Button>

              {canStamp ? (
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/dashboard/karten/${cardId}/stempeln`}>
                    <QrCode />
                    Stempeln
                  </Link>
                </Button>
              ) : null}

              <Button variant="secondary" size="sm" onClick={() => setTestCardOpen(true)}>
                <Smartphone />
                Testkarte aufs Handy
              </Button>
              <Button variant="primary" size="sm" onClick={() => setPublishOpen(true)}>
                <Rocket />
                Veröffentlichen
              </Button>
            </div>
          </div>

          {/* collapsed preview, < 1024px */}
          <button
            type="button"
            data-slot="control"
            className="flex w-full items-center justify-between border-t border-line px-4 py-2 text-[13px] text-ink-2 lg:hidden"
            aria-expanded={mobilePreviewOpen}
            onClick={() => setMobilePreviewOpen((open) => !open)}
          >
            Vorschau
            <ChevronDown
              className={cn('size-4 transition-transform', mobilePreviewOpen && 'rotate-180')}
            />
          </button>
          {mobilePreviewOpen ? (
            <div className="max-h-[70vh] overflow-y-auto border-t border-line bg-canvas px-4 lg:hidden">
              <PreviewPane
                cardId={cardId}
                organizationName={location.organizationName || location.name}
                kind={cardKind}
              />
            </div>
          ) : null}
        </header>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="flex min-h-0 w-full flex-col border-line bg-surface lg:w-[420px] lg:shrink-0 lg:border-r">
            <EditorTabs location={location} kind={cardKind} />
          </div>

          <main className="hidden min-w-0 flex-1 px-8 lg:block">
            <div className="scrollbar-slim sticky top-[57px] h-[calc(100dvh-57px)] overflow-y-auto">
              <PreviewPane
                cardId={cardId}
                organizationName={location.organizationName || location.name}
                kind={cardKind}
              />
            </div>
          </main>
        </div>
      </div>

      <TemplateDialog open={templateOpen} onOpenChange={setTemplateOpen} />
      <TestCardDialog
        open={testCardOpen}
        onOpenChange={setTestCardOpen}
        defaultEmail={userEmail}
      />
      <PublishDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        onPublished={(next) => setVersion(next)}
      />
      <VersionHistoryDialog open={versionsOpen} onOpenChange={setVersionsOpen} />
    </TooltipProvider>
  )
}
