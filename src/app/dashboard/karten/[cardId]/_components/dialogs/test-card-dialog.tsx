'use client'

import * as React from 'react'
import { AlertTriangle, Check, Mail, RefreshCw, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/misc'
import {
  createTestCardAction,
  sendTestCardEmailAction,
  type TestCardPayload,
} from '@/actions/test-card'
import { useCardEditor } from '@/stores/card-editor-provider'

/**
 * The most important button on the page — this is what closes sales conversations.
 *
 * The token (including the pre-rendered strip) is created as the dialog opens, so by the
 * time the QR code is on screen the scan path is nothing but zipping a bundle. Budget
 * from click to card-in-wallet is 20 seconds.
 */
export function TestCardDialog({
  open,
  onOpenChange,
  defaultEmail,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultEmail: string
}) {
  const cardId = useCardEditor((s) => s.cardId)
  const design = useCardEditor((s) => s.design)
  const simulatedStamps = useCardEditor((s) => s.simulatedStamps)

  const [payload, setPayload] = React.useState<TestCardPayload | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  const [email, setEmail] = React.useState(defaultEmail)
  const [sending, setSending] = React.useState(false)
  const [sent, setSent] = React.useState(false)
  const [mailError, setMailError] = React.useState<string | null>(null)

  const generate = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    setSent(false)
    setMailError(null)
    try {
      const result = await createTestCardAction({
        cardId,
        design,
        simulatedStamps: Math.min(simulatedStamps, design.stampGoal),
      })
      if (!result.success) {
        setError(result.error.message)
        setPayload(null)
        return
      }
      setPayload(result.data)
    } catch {
      setError('Die Testkarte konnte nicht erzeugt werden. Bitte erneut versuchen.')
      setPayload(null)
    } finally {
      setLoading(false)
    }
  }, [cardId, design, simulatedStamps])

  React.useEffect(() => {
    if (!open) return
    void generate()
    // Regenerating on every design keystroke would be wasteful — the snapshot is taken
    // when the dialog opens, and the refresh button covers the rest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleSend = async () => {
    if (!payload) return
    setSending(true)
    setMailError(null)
    try {
      const result = await sendTestCardEmailAction({ cardId, token: payload.token, email })
      if (!result.success) {
        setMailError(result.error.message)
        return
      }
      setSent(true)
    } catch {
      setMailError('Der Versand hat nicht geklappt. Bitte erneut versuchen.')
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Testkarte aufs Handy</DialogTitle>
          <DialogDescription>
            QR-Code mit der Handykamera scannen. iPhone und Android bekommen automatisch das
            passende Format.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3">
          <div className="flex size-[232px] items-center justify-center rounded-xl border border-line bg-white p-3">
            {loading ? (
              <Spinner className="size-6 text-ink-3" />
            ) : payload ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={payload.qrDataUrl} alt="QR-Code zur Testkarte" className="size-full" />
            ) : (
              <AlertTriangle className="size-6 text-danger" />
            )}
          </div>

          {payload && !(payload.signing.apple && payload.signing.google) ? (
            <div className="w-full space-y-1 rounded-lg border border-warn/40 bg-warn-soft px-3 py-2.5 text-[12px] leading-snug text-warn-ink">
              <p className="font-medium">
                {!payload.signing.apple && !payload.signing.google
                  ? 'Noch keine signierten Pässe hinterlegt'
                  : !payload.signing.apple
                    ? 'Apple Wallet noch nicht eingerichtet'
                    : 'Google Wallet noch nicht eingerichtet'}
              </p>
              <p>
                {!payload.signing.apple && !payload.signing.google
                  ? 'Der Link öffnet sich, aber weder Apple noch Google Wallet nehmen die Karte an — beide lehnen unsignierte Pässe ab.'
                  : !payload.signing.apple
                    ? 'Google Wallet funktioniert. Apple Wallet lehnt die Karte ab, weil noch kein Zertifikat hinterlegt ist (Apple Developer Program erforderlich).'
                    : 'Apple Wallet funktioniert. Google Wallet lehnt die Karte ab, weil noch kein Aussteller-Konto hinterlegt ist.'}
              </p>
            </div>
          ) : null}

          {payload ? (
            <p className="text-center text-[12px] text-ink-3">
              Gültig bis{' '}
              {new Date(payload.expiresAt).toLocaleTimeString('de-DE', {
                hour: '2-digit',
                minute: '2-digit',
              })}{' '}
              Uhr
            </p>
          ) : null}

          {error ? (
            <p role="alert" className="text-center text-[13px] text-danger">
              {error}
            </p>
          ) : null}

          <Button variant="ghost" size="sm" onClick={() => void generate()} disabled={loading}>
            <RefreshCw />
            Neu erzeugen
          </Button>
        </div>

        <div className="space-y-2 rounded-lg border border-line bg-surface-2 p-3">
          <Label htmlFor="test-card-email" className="flex items-center gap-1.5">
            <Mail className="size-3.5" />
            Alternativ per E-Mail schicken
          </Label>
          <div className="flex gap-2">
            <Input
              id="test-card-email"
              type="email"
              value={email}
              placeholder="name@beispiel.de"
              onChange={(e) => {
                setEmail(e.target.value)
                setSent(false)
              }}
            />
            <Button
              variant="outline"
              className="bg-surface"
              disabled={sending || !payload || email.trim().length === 0}
              onClick={handleSend}
            >
              {sending ? <Spinner /> : sent ? <Check /> : null}
              {sent ? 'Verschickt' : 'Senden'}
            </Button>
          </div>
          {mailError ? (
            <p role="alert" className="text-[12px] text-danger">
              {mailError}
            </p>
          ) : (
            <p className="text-[12px] text-ink-3">Der Link ist 30 Minuten gültig.</p>
          )}
        </div>

        {payload ? (
          <a
            href={payload.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 rounded-lg border border-line px-3 py-2 text-[13px] text-ink-2 hover:bg-surface-2"
          >
            <Smartphone className="size-4" />
            Link im Browser öffnen
          </a>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
