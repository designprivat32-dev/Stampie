'use client'

import Link from 'next/link'
import { Building2, IdCard, Trash2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, Spinner } from '@/components/ui/misc'
import type { CardSummary } from '@/lib/cards/card-service'

/**
 * Kachel einer Visitenkarte in der Übersicht.
 *
 * Eigene Kachel statt Weichen in der Stempelkarten-Kachel: keine Stempelreihe, kein
 * Stempeln, keine Nachrichten, kein Standort-Hinweis — nichts davon gibt es hier.
 */
export function BusinessCardTile({
  card,
  canAssign,
  busy,
  onAssign,
  onDelete,
}: {
  card: CardSummary
  canAssign: boolean
  busy: boolean
  onAssign: () => void
  onDelete: () => void
}) {
  const background = card.preview?.backgroundColor ?? '#1a1a1a'
  const foreground = card.preview?.foregroundColor ?? '#ffffff'
  const href = `/dashboard/karten/${card.id}`

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface">
      <Link href={href} className="block">
        <div
          className="flex h-[110px] flex-col items-center justify-center gap-1.5"
          style={{ backgroundColor: background, color: foreground }}
        >
          <IdCard className="size-7 opacity-80" />
          <span className="text-[12px] font-semibold uppercase tracking-[0.12em] opacity-80">
            Visitenkarte
          </span>
        </div>
      </Link>

      <div className="flex flex-1 flex-col gap-2.5 px-3.5 py-3">
        <div className="flex items-start justify-between gap-2">
          <Link href={href} className="min-w-0">
            <p className="truncate text-[13.5px] font-medium text-ink">{card.name}</p>
            <p className="flex items-center gap-1 truncate text-[12px] text-ink-3">
              <Building2 className="size-3 shrink-0" />
              {card.orgName ?? 'Nicht zugewiesen'}
            </p>
          </Link>
          {card.isPublished ? (
            <Badge tone="ok">v{card.publishedVersion}</Badge>
          ) : (
            <Badge tone="neutral">Entwurf</Badge>
          )}
        </div>

        <p className="flex items-center gap-1.5 text-[12px] text-ink-3">
          <Users className="size-3.5" />
          {card.contactCount === 1 ? '1 Person' : `${card.contactCount} Personen`}
          {' · '}
          {card.issuedCount === 1 ? '1 Pass im Umlauf' : `${card.issuedCount} Pässe im Umlauf`}
        </p>

        <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
          <Button variant="outline" size="sm" asChild>
            <Link href={href}>Bearbeiten</Link>
          </Button>

          {canAssign ? (
            <Button variant="ghost" size="sm" onClick={onAssign}>
              <Building2 />
              {card.orgId ? 'Kunde ändern' : 'Kunde zuweisen'}
            </Button>
          ) : null}

          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto"
            disabled={busy}
            aria-label="Löschen"
            title="Löschen"
            onClick={onDelete}
          >
            {busy ? <Spinner /> : <Trash2 />}
          </Button>
        </div>
      </div>
    </div>
  )
}
