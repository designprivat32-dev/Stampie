'use client'

import { ChevronDown, Plus, Trash2, Undo2, UserRound, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/misc'
import type { EditorContact } from '@/lib/business-cards/editor-service'
import { cn } from '@/lib/utils'
import type { DraftContact } from './editor-state'
import { EditorSection } from './editor-section'
import { PersonForm } from './person-form'

/**
 * Die Personen der Karte. Eine ist aufgeklappt und wird in der Vorschau gezeigt; neue und
 * entfernte Personen werden erst mit dem einen Speichern-Knopf wirksam.
 */
export function PeoplePanel({
  cardId,
  contacts,
  saved,
  openKey,
  onOpen,
  onChange,
  onAdd,
  onRemove,
  pendingDeletes,
  onUndoDeletes,
  onWalletLink,
  errors,
}: {
  cardId: string
  contacts: DraftContact[]
  /** Gespeicherter Stand je Id — für Zahlen und den Wallet-Link. */
  saved: Map<string, EditorContact>
  openKey: string | null
  onOpen: (key: string | null) => void
  onChange: (key: string, patch: Partial<DraftContact>) => void
  onAdd: () => void
  onRemove: (key: string) => void
  pendingDeletes: number
  onUndoDeletes: () => void
  onWalletLink: (contact: EditorContact) => void
  errors: Record<string, string>
}) {
  return (
    <EditorSection
      title="Personen"
      description="Jede Person bekommt ihre eigene Karte mit eigenem QR-Code."
      action={
        <Button variant="outline" size="sm" onClick={onAdd}>
          <Plus />
          Person hinzufügen
        </Button>
      }
    >
      {pendingDeletes > 0 ? (
        <div className="flex items-center justify-between gap-2 rounded-md bg-warn-soft px-3 py-2 text-[12.5px] text-warn-ink">
          <span>
            {pendingDeletes === 1 ? '1 Person wird' : `${pendingDeletes} Personen werden`} beim Speichern entfernt — ihre
            Karten in fremden Wallets werden ungültig.
          </span>
          <Button variant="ghost" size="sm" onClick={onUndoDeletes}>
            <Undo2 />
            Rückgängig
          </Button>
        </div>
      ) : null}

      {contacts.length === 0 ? (
        <button
          type="button"
          onClick={onAdd}
          className="flex w-full flex-col items-center gap-1.5 rounded-lg border border-dashed border-line px-4 py-8 text-ink-3 hover:border-ink-3 hover:text-ink"
        >
          <UserRound className="size-6" />
          <span className="text-[13px] font-medium">Erste Person anlegen</span>
        </button>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {contacts.map((contact, index) => {
            const open = openKey === contact.key
            const stored = contact.id ? saved.get(contact.id) : undefined
            const name = `${contact.firstName} ${contact.lastName}`.trim() || 'Neue Person'
            const hasError = Object.keys(errors).some((k) => k.startsWith(`contacts.${index}.`) || k === `contacts.${index}`)
            return (
              <li key={contact.key}>
                <div className={cn('flex items-center gap-3 px-3 py-2.5', open && 'bg-surface-2')}>
                  <button
                    type="button"
                    onClick={() => onOpen(open ? null : contact.key)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-2">
                      {contact.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={contact.photoUrl} alt="" className="size-full object-cover" />
                      ) : (
                        <UserRound className="size-4 text-ink-3" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[13.5px] font-medium text-ink">{name}</span>
                        {contact.id === null ? <Badge tone="accent">neu</Badge> : null}
                        {hasError ? <Badge tone="danger">prüfen</Badge> : null}
                      </span>
                      <span className="block truncate text-[12px] text-ink-3">
                        {stored
                          ? `${stored.stats.views} Aufrufe · ${stored.stats.walletAdds} ins Wallet · ${stored.stats.contactsSaved} Kontakt gespeichert`
                          : contact.jobTitle || 'Noch nicht gespeichert'}
                      </span>
                    </span>
                    <ChevronDown className={cn('size-4 shrink-0 text-ink-3 transition-transform', open && 'rotate-180')} />
                  </button>
                  {stored ? (
                    <Button variant="outline" size="sm" onClick={() => onWalletLink(stored)}>
                      <Wallet />
                      <span className="hidden sm:inline">Karte ins Wallet</span>
                    </Button>
                  ) : null}
                  <Button variant="ghost" size="icon-sm" aria-label="Person entfernen" onClick={() => onRemove(contact.key)}>
                    <Trash2 />
                  </Button>
                </div>
                {open ? (
                  <div className="border-t border-line px-3 pt-3">
                    <PersonForm
                      cardId={cardId}
                      index={index}
                      contact={contact}
                      onChange={(patch) => onChange(contact.key, patch)}
                      errors={errors}
                    />
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </EditorSection>
  )
}
