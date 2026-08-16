'use client'

import * as React from 'react'
import { Check, Send, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { Spinner } from '@/components/ui/misc'
import {
  cancelCardMessageAction,
  createCardMessageAction,
  listCardMessagesAction,
  type CardMessageSummary,
} from '@/actions/messages'
import { useCardEditor } from '@/stores/card-editor-provider'

const MAX = 150

/**
 * Writing to everyone who holds this card.
 *
 * The two wallets deliver it differently — Apple by changing a field on the pass, Google
 * through its own endpoint — but that split has no business being on screen. What does
 * belong on screen is what actually happened afterwards, which is why every past message
 * keeps its delivery result next to it.
 */
export function MessageDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const cardId = useCardEditor((s) => s.cardId)

  const [messages, setMessages] = React.useState<CardMessageSummary[] | null>(null)
  const [headline, setHeadline] = React.useState('')
  const [body, setBody] = React.useState('')
  const [scheduled, setScheduled] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    const result = await listCardMessagesAction(cardId)
    if (result.success) setMessages(result.data)
    else setError(result.error.message)
  }, [cardId])

  React.useEffect(() => {
    if (!open) return
    setError(null)
    void load()
  }, [open, load])

  const send = async () => {
    setBusy(true)
    setError(null)
    const result = await createCardMessageAction({
      cardId,
      headline: headline.trim() || null,
      body: body.trim(),
      // A local datetime-local value carries no zone; the browser's own offset is the one
      // the shop meant when they picked it.
      scheduledFor: scheduled ? new Date(scheduled).toISOString() : null,
    })
    if (result.success) {
      setBody('')
      setHeadline('')
      setScheduled('')
      await load()
    } else {
      setError(result.error.message)
    }
    setBusy(false)
  }

  const cancel = async (id: string) => {
    setBusy(true)
    const result = await cancelCardMessageAction(id)
    if (!result.success) setError(result.error.message)
    await load()
    setBusy(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nachricht an Karteninhaber</DialogTitle>
          <DialogDescription>
            Erreicht jeden, der diese Karte im Wallet hat. Leer lassen und später planen ist
            möglich.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Field label="Überschrift" htmlFor="msg-headline" hint="Nur Google Wallet zeigt sie an.">
            <Input
              id="msg-headline"
              value={headline}
              maxLength={60}
              placeholder="Aktion diese Woche"
              onChange={(e) => setHeadline(e.target.value)}
            />
          </Field>

          <Field
            label="Nachricht"
            htmlFor="msg-body"
            hint={`Höchstens ${MAX} Zeichen — mehr zeigt iOS auf dem Sperrbildschirm nicht.`}
          >
            <Textarea
              id="msg-body"
              value={body}
              maxLength={MAX}
              rows={3}
              placeholder="Heute doppelte Stempel auf alle Getränke."
              onChange={(e) => setBody(e.target.value)}
            />
          </Field>

          <div className="flex items-end gap-3">
            <Field
              label="Senden am"
              htmlFor="msg-when"
              hint="Leer heißt sofort."
              className="flex-1"
            >
              <Input
                id="msg-when"
                type="datetime-local"
                value={scheduled}
                onChange={(e) => setScheduled(e.target.value)}
              />
            </Field>
            <span className="pb-2 text-[12px] tabular-nums text-ink-3">
              {body.length}/{MAX}
            </span>
          </div>
        </div>

        {error ? (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        ) : null}

        {messages && messages.length > 0 ? (
          <div className="max-h-52 space-y-2 overflow-y-auto border-t border-line pt-3">
            {messages.map((m) => (
              <div key={m.id} className="flex items-start gap-2 text-[12px] leading-snug">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-ink-2">{m.body}</p>
                  <p className="text-ink-3">
                    {m.sentAt ? (
                      <>
                        Gesendet · {m.appleDevices} iPhones
                        {m.googleSynced ? ' · Google erreicht' : ' · Google nicht erreicht'}
                      </>
                    ) : (
                      <>Geplant für {new Date(m.scheduledFor).toLocaleString('de-DE')}</>
                    )}
                  </p>
                  {m.error ? <p className="text-warn-ink">{m.error}</p> : null}
                </div>
                {m.sentAt ? (
                  <Check className="mt-0.5 size-3.5 shrink-0 text-ok" />
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Geplante Nachricht verwerfen"
                    disabled={busy}
                    onClick={() => void cancel(m.id)}
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
            ))}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Schließen
          </Button>
          <Button variant="primary" disabled={busy || body.trim().length === 0} onClick={send}>
            {busy ? <Spinner /> : <Send />}
            {scheduled ? 'Einplanen' : 'Jetzt senden'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
