'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Copy, ExternalLink, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/misc'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { renewOwnerLinkAction, renewScanCodeAction } from '@/actions/business-cards'
import type { EditorContact } from '@/lib/business-cards/editor-service'

/**
 * Der Link für die Person selbst, plus ihr öffentlicher QR-Code.
 *
 * Der Link gehört aufs Handy der Person (per Mail, Messenger oder direkt den QR scannen).
 * Beide „Erneuern"-Knöpfe wirken sofort — sie machen alte Links ungültig, das soll nicht bis
 * zum nächsten Speichern warten.
 */
export function WalletLinkDialog({ contact, onClose }: { contact: EditorContact | null; onClose: () => void }) {
  const router = useRouter()
  const [copied, setCopied] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [confirmCode, setConfirmCode] = React.useState(false)

  React.useEffect(() => {
    setCopied(false)
    setConfirmCode(false)
  }, [contact])

  const run = async (action: (id: string) => Promise<unknown>) => {
    if (!contact) return
    setBusy(true)
    try {
      await action(contact.id)
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

  return (
    <Dialog open={contact !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Karte für {contact?.contact.firstName} {contact?.contact.lastName}
          </DialogTitle>
          <DialogDescription>
            Diesen Code mit dem Handy der Person scannen oder den Link schicken — dort holt sie
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
                <Button variant="danger" size="sm" disabled={busy} onClick={() => void run(renewScanCodeAction)}>
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
          <Button variant="ghost" disabled={busy} onClick={() => void run(renewOwnerLinkAction)}>
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
