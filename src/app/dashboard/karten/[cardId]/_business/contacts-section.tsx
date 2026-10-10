'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Copy, ExternalLink, Pencil, Plus, RefreshCw, Trash2, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, Spinner } from '@/components/ui/misc'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { deleteContactAction, renewOwnerLinkAction, renewScanCodeAction } from '@/actions/business-cards'
import type { EditorContact } from '@/lib/business-cards/editor-service'
import { ContactDialog } from './contact-dialog'
import { EditorSection } from './editor-section'

/**
 * Die Personen einer Visitenkarte. Jede hat ihren eigenen QR-Code und ihren eigenen Link,
 * über den sie sich die Karte mit QR-Code ins Wallet holt.
 */
export function ContactsSection({
  cardId,
  contacts,
  published,
}: {
  cardId: string
  contacts: EditorContact[]
  published: boolean
}) {
  const [editing, setEditing] = React.useState<EditorContact | 'new' | null>(null)
  const [walletFor, setWalletFor] = React.useState<EditorContact | null>(null)
  const [deleting, setDeleting] = React.useState<EditorContact | null>(null)

  return (
    <EditorSection
      title="Personen"
      description="Jede Person bekommt ihre eigene Karte mit eigenem QR-Code."
      action={
        <Button variant="outline" size="sm" onClick={() => setEditing('new')}>
          <Plus />
          Person hinzufügen
        </Button>
      }
    >
      {contacts.length === 0 ? (
        <p className="text-[13px] text-ink-3">Noch niemand angelegt.</p>
      ) : (
        <ul className="divide-y divide-line">
          {contacts.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium text-ink">
                  {entry.contact.firstName} {entry.contact.lastName}
                </p>
                <p className="truncate text-[12px] text-ink-3">
                  {entry.contact.jobTitle ?? 'Ohne Position'}
                  {' · '}
                  {entry.stats.views} Aufrufe · {entry.stats.walletAdds} ins Wallet ·{' '}
                  {entry.stats.contactsSaved} Kontakt gespeichert
                </p>
              </div>
              {entry.stats.ownerHasPass ? <Badge tone="ok">Eigene Karte geholt</Badge> : null}
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={!published} onClick={() => setWalletFor(entry)}>
                  <Wallet />
                  Karte ins Wallet
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label="Bearbeiten" onClick={() => setEditing(entry)}>
                  <Pencil />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label="Löschen" onClick={() => setDeleting(entry)}>
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {!published && contacts.length > 0 ? (
        <p className="text-[12px] text-warn-ink">
          Erst das Aussehen speichern — vorher zeigt der Link nichts an.
        </p>
      ) : null}

      <ContactDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        cardId={cardId}
        contactId={editing && editing !== 'new' ? editing.id : null}
        contact={editing && editing !== 'new' ? editing.contact : null}
      />
      <WalletLinkDialog contact={walletFor} onClose={() => setWalletFor(null)} />
      <DeleteContactDialog contact={deleting} onClose={() => setDeleting(null)} />
    </EditorSection>
  )
}

/**
 * Der Link für die Person selbst, plus ihr öffentlicher QR-Code.
 *
 * Der Link gehört aufs Handy der Person (per Mail, Messenger oder direkt den QR scannen).
 * Der zweite Code ist der, den sie später selbst vorzeigt — hier nur zum Ausprobieren.
 */
function WalletLinkDialog({ contact, onClose }: { contact: EditorContact | null; onClose: () => void }) {
  const router = useRouter()
  const [copied, setCopied] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [confirmCode, setConfirmCode] = React.useState(false)

  React.useEffect(() => {
    setCopied(false)
    setConfirmCode(false)
  }, [contact])

  const renewCode = async () => {
    if (!contact) return
    setBusy(true)
    try {
      await renewScanCodeAction(contact.id)
      router.refresh()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const renew = async () => {
    if (!contact) return
    setBusy(true)
    try {
      await renewOwnerLinkAction(contact.id)
      router.refresh()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={contact !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Karte für {contact?.contact.firstName} {contact?.contact.lastName}
          </DialogTitle>
          <DialogDescription>
            Diesen Code mit dem iPhone der Person scannen oder den Link schicken — dort holt sie
            sich ihre Visitenkarte mit QR-Code ins Wallet.
          </DialogDescription>
        </DialogHeader>

        {contact?.ownerUrl && contact.ownerQr ? (
          <div className="space-y-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={contact.ownerQr} alt="QR-Code zum eigenen Wallet-Pass" className="mx-auto size-48" />
            <div className="flex items-center gap-2 rounded-md border border-line bg-surface-2 px-2 py-1.5">
              <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink-2">{contact.ownerUrl}</span>
              <Button variant="ghost" size="sm" onClick={() => void copy(contact.ownerUrl!)}>
                <Copy />
                {copied ? 'Kopiert' : 'Kopieren'}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-[13px] text-ink-2">Kein Link vorhanden — bitte neu erzeugen.</p>
        )}

        {contact ? (
          <div className="space-y-2 border-t border-line pt-3 text-[12px] text-ink-3">
            <p>
              Öffentliche Seite, die der QR-Code auf der Karte öffnet:{' '}
              <a href={contact.scanUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
                ansehen <ExternalLink className="size-3" />
              </a>
            </p>
            {confirmCode ? (
              <div className="flex flex-wrap items-center gap-2 rounded-md bg-warn-soft px-2.5 py-2 text-warn-ink">
                <span className="flex-1">
                  Der alte QR-Code funktioniert danach nicht mehr. Die Karte der Person zeigt den neuen von selbst.
                </span>
                <Button variant="danger" size="sm" disabled={busy} onClick={() => void renewCode()}>
                  {busy ? <Spinner /> : null}
                  Erneuern
                </Button>
              </div>
            ) : (
              <button type="button" className="underline" onClick={() => setConfirmCode(true)}>
                QR-Code der Karte erneuern
              </button>
            )}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={() => void renew()}>
            {busy ? <Spinner /> : <RefreshCw />}
            Neuen Link erzeugen
          </Button>
          <Button variant="primary" onClick={onClose}>
            Fertig
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeleteContactDialog({ contact, onClose }: { contact: EditorContact | null; onClose: () => void }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const remove = async () => {
    if (!contact) return
    setBusy(true)
    setError(null)
    try {
      const result = await deleteContactAction(contact.id)
      if (!result.success) {
        setError(result.error.message)
        return
      }
      router.refresh()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const holders = contact?.stats.holders ?? 0

  return (
    <Dialog open={contact !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {contact?.contact.firstName} {contact?.contact.lastName} löschen?
          </DialogTitle>
          <DialogDescription>
            Der QR-Code funktioniert danach nicht mehr.
            {holders > 0
              ? ` ${holders} ${holders === 1 ? 'Karte in fremden Wallets wird' : 'Karten in fremden Wallets werden'} als ungültig markiert.`
              : ''}
          </DialogDescription>
        </DialogHeader>
        {error ? <p className="text-[13px] text-danger">{error}</p> : null}
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Abbrechen
          </Button>
          <Button variant="danger" disabled={busy} onClick={() => void remove()}>
            {busy ? <Spinner /> : <Trash2 />}
            Löschen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
