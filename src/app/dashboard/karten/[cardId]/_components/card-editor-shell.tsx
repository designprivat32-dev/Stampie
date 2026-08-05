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
import type { LocationSummary } from '@/types/location'
import { cn } from '@/lib/utils'

/**
 * Two-column workspace: editor left, preview right.
 *
 * The editor takes the room and the preview gets a fixed lane, not the other way round. The
 * card itself is 336px wide however big the screen is, so a flexible preview column just
 * grew its grey backdrop while the settings stayed in a 420px canyon that had to be
 * scrolled. Wide editor + multi-column sections is what puts a whole tab on screen at once.
 *
 * Below 1280px — the agency's iPad, and any smaller laptop — the preview collapses into a bar
 * at the top of the header that expands on tap, so the editor keeps the full width.
 */
export function CardEditorShell({
  cardName,
  location,
  userEmail,
  publishedVersion,
  suggestTemplate,
  canStamp,
}: {
  cardName: string
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
      {/*
        The window never scrolls; the columns do. A sticky header plus a hardcoded
        `top-[57px]` used to leave the page a few pixels too tall whenever the real header
        measured anything other than 57 — which it does as soon as the toolbar wraps.
      */}
      <div className="flex h-dvh flex-col overflow-hidden bg-canvas">
        <header className="z-30 shrink-0 border-b border-line bg-surface/95 backdrop-blur">
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

              {/*
                Below 1280px the labels go and the icons stay. A wrapped toolbar costs a whole
                row of height, and that row comes straight out of the editor below it.
              */}
              <Button
                variant="ghost"
                size="sm"
                title="Vorlagen"
                onClick={() => setTemplateOpen(true)}
              >
                <LayoutTemplate />
                <span className="hidden xl:inline">Vorlagen</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                title="Versionen"
                onClick={() => setVersionsOpen(true)}
              >
                <History />
                <span className="hidden xl:inline">Versionen</span>
              </Button>

              {canStamp ? (
                <Button variant="ghost" size="sm" title="Stempeln" asChild>
                  <Link href={`/dashboard/karten/${cardId}/stempeln`}>
                    <QrCode />
                    <span className="hidden xl:inline">Stempeln</span>
                  </Link>
                </Button>
              ) : null}

              <Button
                variant="secondary"
                size="sm"
                title="Testkarte aufs Handy"
                onClick={() => setTestCardOpen(true)}
              >
                <Smartphone />
                <span className="hidden xl:inline">Testkarte aufs Handy</span>
              </Button>
              <Button
                variant="primary"
                size="sm"
                title="Veröffentlichen"
                onClick={() => setPublishOpen(true)}
              >
                <Rocket />
                <span className="hidden xl:inline">Veröffentlichen</span>
              </Button>
            </div>
          </div>

          {/*
            Collapsed preview below 1280px. It used to switch at 1024, which left the editor
            620px next to the preview lane — one column, and back to scrolling. Under 1280 the
            editor takes the whole width and the preview lives here instead.
          */}
          <button
            type="button"
            data-slot="control"
            className="flex w-full items-center justify-between border-t border-line px-4 py-2 text-[13px] text-ink-2 xl:hidden"
            aria-expanded={mobilePreviewOpen}
            onClick={() => setMobilePreviewOpen((open) => !open)}
          >
            Vorschau
            <ChevronDown
              className={cn('size-4 transition-transform', mobilePreviewOpen && 'rotate-180')}
            />
          </button>
          {mobilePreviewOpen ? (
            <div className="max-h-[70vh] overflow-y-auto border-t border-line bg-canvas px-4 xl:hidden">
              <PreviewPane
                cardId={cardId}
                organizationName={location.organizationName || location.name}
              />
            </div>
          ) : null}
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto xl:flex-row xl:overflow-hidden">
          <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col bg-canvas">
            <EditorTabs location={location} />
          </div>

          <main className="hidden w-[404px] shrink-0 border-l border-line px-4 xl:block">
            <div className="h-full">
              <PreviewPane
                cardId={cardId}
                organizationName={location.organizationName || location.name}
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
