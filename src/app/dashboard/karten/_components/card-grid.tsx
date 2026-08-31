'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Building2, MapPin, Plus, QrCode, Send, Trash2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, Spinner } from '@/components/ui/misc'
import { Input } from '@/components/ui/input'
import { Label, FieldError } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { NewCardDialog } from './new-card-dialog'
import { AssignCustomerDialog } from './assign-customer-dialog'
import { MessageDialog } from './message-dialog'
import { deleteCardAction } from '@/actions/cards'
import { setGeoNotificationsAction } from '@/actions/card-design'
import { stripPreviewUrl } from '@/lib/cards/preview-url'
import type { CardSummary, CustomerOption } from '@/lib/cards/card-service'
import { DEFAULT_CARD_DESIGN } from '@/lib/cards/defaults'
import { cn } from '@/lib/utils'

/**
 * The card overview — the entry point to everything.
 *
 * Each tile previews through the real strip renderer, so the grid shows what the customer
 * actually holds rather than an approximation.
 */
export function CardGrid({
  cards,
  customers,
  canAssign,
  canStamp,
}: {
  cards: CardSummary[]
  customers: CustomerOption[]
  /** Only agency members hand cards to customers. */
  canAssign: boolean
  /** Agency members design cards but never book stamps. */
  canStamp: boolean
}) {
  const router = useRouter()
  const [creating, setCreating] = React.useState(false)
  const [assigning, setAssigning] = React.useState<CardSummary | null>(null)
  const [messaging, setMessaging] = React.useState<CardSummary | null>(null)
  const [deleting, setDeleting] = React.useState<CardSummary | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)

  // Löschen ist endgültig und nimmt die Pässe der Kunden mit — deshalb erst die Rückfrage,
  // die beziffert, was daran hängt, dann das Passwort, und dann erst der Griff zur Aktion.
  // Gibt die Fehlermeldung zurück, damit der Dialog sie am Passwortfeld zeigen kann.
  const handleDelete = async (card: CardSummary, password: string): Promise<string | null> => {
    setBusyId(card.id)
    try {
      const result = await deleteCardAction(card.id, password)
      if (!result.success) return result.error.message
      setDeleting(null)
      router.refresh()
      return null
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[17px] font-semibold text-ink">Karten</h1>
          <p className="text-[13px] text-ink-3">
            {cards.length === 0
              ? 'Noch keine Karte angelegt.'
              : `${cards.length} ${cards.length === 1 ? 'Karte' : 'Karten'}`}
          </p>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus />
          Neue Karte
        </Button>
      </div>

      {cards.length === 0 ? (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-line px-6 py-16 text-center transition-colors hover:border-line-strong hover:bg-surface-2"
        >
          <Plus className="size-6 text-ink-3" />
          <span className="text-[14px] font-medium text-ink">Erste Karte anlegen</span>
          <span className="max-w-sm text-[12.5px] leading-snug text-ink-3">
            Danach öffnet sich der Designer: Farben, Stempel, Texte — und die Testkarte aufs
            Handy.
          </span>
        </button>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <CardTile
              key={card.id}
              card={card}
              canAssign={canAssign}
              canStamp={canStamp}
              busy={busyId === card.id}
              onAssign={() => setAssigning(card)}
              onMessage={() => setMessaging(card)}
              onDelete={() => setDeleting(card)}
            />
          ))}

          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line text-ink-3 transition-colors hover:border-line-strong hover:bg-surface-2 hover:text-ink"
          >
            <Plus className="size-6" />
            <span className="text-[13px] font-medium">Neue Karte</span>
          </button>
        </div>
      )}

      <NewCardDialog
        open={creating}
        onOpenChange={setCreating}
        customers={customers}
        canChooseCustomer={canAssign}
      />
      <AssignCustomerDialog
        card={assigning}
        customers={customers}
        onOpenChange={(open) => !open && setAssigning(null)}
      />
      {messaging ? (
        <MessageDialog
          cardId={messaging.id}
          open
          onOpenChange={(open) => !open && setMessaging(null)}
        />
      ) : null}
      <DeleteCardDialog
        card={deleting}
        busy={deleting !== null && busyId === deleting.id}
        onOpenChange={(open) => !open && setDeleting(null)}
        onConfirm={(password) =>
          deleting ? handleDelete(deleting, password) : Promise.resolve(null)
        }
      />
    </div>
  )
}

/**
 * Die Rückfrage vor dem Löschen.
 *
 * Sie nennt beim Namen, was verschwindet — vor allem die Karten im Umlauf, denn die liegen
 * bei Kunden im Wallet und lassen sich durch nichts wiederherstellen. Ohne diese Zahl wäre
 * „Löschen?" eine Frage, die niemand beantworten kann.
 *
 * Danach noch das Passwort: eine offene Sitzung reicht für diesen Klick nicht. Geprüft wird
 * es auf dem Server (`lib/auth/reauth`) — das Feld hier ist nur die Eingabe dafür.
 */
function DeleteCardDialog({
  card,
  busy,
  onOpenChange,
  onConfirm,
}: {
  card: CardSummary | null
  busy: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (password: string) => Promise<string | null>
}) {
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  // Jede neue Rückfrage startet leer — ein stehengebliebenes Passwort im Feld wäre genau
  // die Bequemlichkeit, die diese Abfrage verhindern soll.
  React.useEffect(() => {
    if (card === null) {
      setPassword('')
      setError(null)
    }
  }, [card])

  const submit = async () => {
    setError(null)
    const message = await onConfirm(password)
    if (message) {
      setError(message)
      setPassword('')
    }
  }

  return (
    <Dialog open={card !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{card ? `„${card.name}" löschen?` : 'Karte löschen?'}</DialogTitle>
          <DialogDescription>
            {card && card.issuedCount > 0 ? (
              <>
                {card.issuedCount === 1
                  ? 'Eine Karte ist im Umlauf'
                  : `${card.issuedCount} Karten sind im Umlauf`}{' '}
                — diese Pässe bleiben im Wallet der Kunden stehen, lassen sich aber nicht
                mehr stempeln und nicht mehr aktualisieren.{' '}
              </>
            ) : null}
            Design, Bilder, ausgegebene Karten und die gesamte Stempel-Historie werden
            gelöscht. Das lässt sich nicht rückgängig machen.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <Label htmlFor="delete-password">Zum Bestätigen dein Passwort</Label>
          <Input
            id="delete-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={error !== null}
            disabled={busy}
          />
          <FieldError>{error}</FieldError>
        </form>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Abbrechen
          </Button>
          <Button
            variant="danger"
            onClick={() => void submit()}
            disabled={busy || password.length === 0}
          >
            {busy ? <Spinner /> : <Trash2 />}
            Endgültig löschen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Der Standort-Schalter, dort wo die Karten stehen.
 *
 * Im Designer liegt er unter „Erweitert" — richtig für das Einrichten, falsch für den
 * Betrieb: wer die Benachrichtigung für die Sommeraktion anschaltet und im Herbst wieder
 * aus, will dafür keine Karte öffnen, kein Panel aufklappen und nichts veröffentlichen.
 * Deshalb wirkt er hier sofort auf die ausgegebenen Karten.
 */
function GeoNotificationToggle({ card }: { card: CardSummary }) {
  const router = useRouter()
  const { enabled: serverEnabled, locationCount, canEnable } = card.geoNotifications
  const [enabled, setEnabled] = React.useState(serverEnabled)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Nach dem Neuladen gewinnt der Server: der Schalter zeigt nie einen Stand an, den die
  // ausgegebenen Karten nicht haben.
  React.useEffect(() => setEnabled(serverEnabled), [serverEnabled])

  // Anschalten ginge ins Leere, solange weder Karte noch Stammdaten einen Standort kennen.
  // Ausschalten bleibt immer erlaubt.
  const blocked = !canEnable && !enabled

  const toggle = async (next: boolean) => {
    setEnabled(next)
    setBusy(true)
    setError(null)
    const result = await setGeoNotificationsAction({ cardId: card.id, enabled: next })
    setBusy(false)
    if (!result.success) {
      setEnabled(!next)
      setError(result.error.message)
      return
    }
    router.refresh()
  }

  const hint = blocked
    ? 'Kein Standort hinterlegt'
    : enabled
      ? `${locationCount} ${locationCount === 1 ? 'Standort' : 'Standorte'} · Sperrbildschirm`
      : 'Aus · Standorte bleiben gespeichert'

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[12px] font-medium text-ink">
            <MapPin className="size-3.5 shrink-0 text-ink-3" />
            In der Nähe benachrichtigen
          </p>
          <p className="truncate pl-5 text-[11px] text-ink-3">{hint}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {busy ? <Spinner className="text-ink-3" /> : null}
          <Switch
            checked={enabled}
            disabled={busy || blocked}
            aria-label={`Standort-Benachrichtigung für ${card.name}`}
            title={
              blocked
                ? 'Erst einen Standort im Designer unter „Erweitert" hinterlegen.'
                : undefined
            }
            onCheckedChange={(next) => void toggle(next)}
          />
        </div>
      </div>
      {error ? <p className="text-[11px] text-warn-ink">{error}</p> : null}
    </div>
  )
}

function CardTile({
  card,
  canAssign,
  canStamp,
  busy,
  onAssign,
  onMessage,
  onDelete,
}: {
  card: CardSummary
  canAssign: boolean
  canStamp: boolean
  busy: boolean
  onAssign: () => void
  onMessage: () => void
  onDelete: () => void
}) {
  const preview = card.preview
  const design = preview
    ? {
        ...DEFAULT_CARD_DESIGN,
        backgroundColor: preview.backgroundColor,
        foregroundColor: preview.foregroundColor,
        stampGoal: preview.stampGoal,
        stampIcon: preview.stampIcon,
        emptyStampStyle: preview.emptyStampStyle as typeof DEFAULT_CARD_DESIGN.emptyStampStyle,
        stampIconAssetId: preview.stampIconAssetId,
        heroAssetId: preview.heroAssetId,
      }
    : null

  const stamps = design ? Math.ceil(design.stampGoal * 0.6) : 0

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface">
      <Link href={`/dashboard/karten/${card.id}`} className="block">
        <div style={{ backgroundColor: preview?.backgroundColor ?? '#1a1a1a' }}>
          <div className="flex items-center justify-between gap-2 px-3 pb-1.5 pt-2.5">
            <span
              className="truncate text-[12px] font-semibold"
              style={{ color: preview?.foregroundColor ?? '#ffffff' }}
            >
              {preview?.programName?.trim() || card.name}
            </span>
            {design ? (
              <span
                className="shrink-0 text-[11px] tabular-nums"
                style={{ color: preview?.labelColor ?? '#cccccc' }}
              >
                {stamps}/{design.stampGoal}
              </span>
            ) : null}
          </div>
          {design ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={stripPreviewUrl(design, { cardId: card.id, currentStamps: stamps, scale: 2 })}
              alt=""
              className="block w-full"
              style={{ aspectRatio: String(375 / 123) }}
            />
          ) : (
            <div className="h-[110px]" />
          )}
        </div>
      </Link>

      <div className="flex flex-1 flex-col gap-2.5 px-3.5 py-3">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/dashboard/karten/${card.id}`} className="min-w-0">
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
          {card.issuedCount === 0
            ? 'Noch keine Karten ausgegeben'
            : `${card.issuedCount} ${card.issuedCount === 1 ? 'Karte' : 'Karten'} im Umlauf`}
          {card.testCount > 0 ? (
            <span className="text-ink-3">· {card.testCount} Test</span>
          ) : null}
        </p>

        <GeoNotificationToggle card={card} />

        <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/dashboard/karten/${card.id}`}>Bearbeiten</Link>
          </Button>

          {canStamp && card.orgId ? (
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/dashboard/karten/${card.id}/stempeln`}>
                <QrCode />
                Stempeln
              </Link>
            </Button>
          ) : null}

          {/*
            Only where someone actually holds the card. A message to nobody is a button
            that can only disappoint.
          */}
          {card.issuedCount > 0 ? (
            <Button variant="ghost" size="sm" onClick={onMessage}>
              <Send />
              Nachricht
            </Button>
          ) : null}

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
