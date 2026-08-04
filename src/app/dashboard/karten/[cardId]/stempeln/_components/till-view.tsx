'use client'

import * as React from 'react'
import { AlertTriangle, Check, Gift, RotateCw, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge, Spinner } from '@/components/ui/misc'
import { QrScanner } from './qr-scanner'
import {
  lookupPassAction,
  redeemAction,
  stampAction,
  type PassSummary,
  type StampResult,
} from '@/actions/stamping'
import { cn } from '@/lib/utils'

/**
 * The till view: scan a customer's card, book one stamp, cash in a full card.
 *
 * Optimised for one-handed use next to a coffee machine — the result has to be readable
 * from arm's length, and every outcome (success, cooldown, wrong location, full card)
 * says what to do next rather than showing an error code.
 */

type Feedback =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'ok'; result: StampResult; action: 'stamp' | 'redeem' }
  | { kind: 'info'; pass: PassSummary }
  | { kind: 'error'; message: string }

export function TillView({
  cardId,
  initialSerial,
}: {
  cardId: string
  /** Present when staff arrived by scanning the card's barcode. */
  initialSerial?: string | null
}) {
  const [feedback, setFeedback] = React.useState<Feedback>({ kind: 'idle' })
  const [manual, setManual] = React.useState(initialSerial ?? '')
  const busyRef = React.useRef(false)

  const run = React.useCallback(
    async (scanned: string, mode: 'stamp' | 'lookup' | 'redeem') => {
      if (busyRef.current) return
      busyRef.current = true
      setFeedback({ kind: 'busy' })

      try {
        const action = mode === 'stamp' ? stampAction : mode === 'redeem' ? redeemAction : null
        const result = action
          ? await action({ cardId, scanned })
          : await lookupPassAction({ cardId, scanned })

        if (!result.success) {
          setFeedback({ kind: 'error', message: result.error.message })
          return
        }

        if (action) {
          setFeedback({ kind: 'ok', result: result.data as StampResult, action: mode as 'stamp' | 'redeem' })
        } else {
          setFeedback({ kind: 'info', pass: result.data as PassSummary })
        }
      } catch {
        setFeedback({ kind: 'error', message: 'Verbindung unterbrochen. Bitte erneut versuchen.' })
      } finally {
        busyRef.current = false
      }
    },
    [cardId],
  )

  // Arriving via the barcode shows the card's state immediately, but never books a stamp
  // on its own — that stays an explicit action.
  const lookedUp = React.useRef(false)
  React.useEffect(() => {
    if (!initialSerial || lookedUp.current) return
    lookedUp.current = true
    void run(initialSerial, 'lookup')
  }, [initialSerial, run])

  const currentSerial =
    feedback.kind === 'ok'
      ? feedback.result.pass.serial
      : feedback.kind === 'info'
        ? feedback.pass.serial
        : null

  return (
    <div className="mx-auto w-full max-w-md space-y-4 p-4">
      <QrScanner onScan={(value) => void run(value, 'stamp')} disabled={feedback.kind === 'busy'} />

      <div className="space-y-1.5">
        <Label htmlFor="manual-serial">
          Kartennummer von Hand
          <span className="ml-1 font-normal text-ink-3">
            — falls die Kamera streikt, steht sie unter dem Barcode
          </span>
        </Label>
        <div className="flex gap-2">
          <Input
            id="manual-serial"
            value={manual}
            placeholder="TEST-RH0EJNHI"
            autoCapitalize="characters"
            spellCheck={false}
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && manual.trim()) void run(manual.trim(), 'stamp')
            }}
          />
          <Button
            variant="outline"
            disabled={!manual.trim() || feedback.kind === 'busy'}
            onClick={() => void run(manual.trim(), 'lookup')}
          >
            <Search />
            Prüfen
          </Button>
          <Button
            variant="primary"
            disabled={!manual.trim() || feedback.kind === 'busy'}
            onClick={() => void run(manual.trim(), 'stamp')}
          >
            Stempeln
          </Button>
        </div>
      </div>

      <ResultPanel feedback={feedback} />

      {currentSerial ? (
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            disabled={feedback.kind === 'busy'}
            onClick={() => void run(currentSerial, 'redeem')}
          >
            <Gift />
            Belohnung einlösen
          </Button>
          <Button
            variant="ghost"
            disabled={feedback.kind === 'busy'}
            onClick={() => setFeedback({ kind: 'idle' })}
          >
            <RotateCw />
            Zurücksetzen
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function ResultPanel({ feedback }: { feedback: Feedback }) {
  if (feedback.kind === 'idle') {
    return (
      <p className="rounded-lg border border-dashed border-line px-3 py-8 text-center text-[13px] text-ink-3">
        Kundenkarte scannen oder Nummer eingeben.
      </p>
    )
  }

  if (feedback.kind === 'busy') {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg border border-line px-3 py-8 text-[13px] text-ink-3">
        <Spinner />
        Wird gebucht…
      </div>
    )
  }

  if (feedback.kind === 'error') {
    return (
      <div className="flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger-soft px-3 py-3 text-danger">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <p className="text-[13px] leading-snug">{feedback.message}</p>
      </div>
    )
  }

  const pass = feedback.kind === 'ok' ? feedback.result.pass : feedback.pass
  const booked = feedback.kind === 'ok'
  const completed = feedback.kind === 'ok' && feedback.result.completesCard

  return (
    <div
      className={cn(
        'space-y-3 rounded-xl border px-4 py-4',
        completed
          ? 'border-ok/40 bg-ok-soft'
          : booked
            ? 'border-accent/40 bg-accent-soft'
            : 'border-line bg-surface',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[12px] text-ink-3">{pass.serial}</p>
          <p className="text-[13px] font-medium text-ink">
            {booked ? (completed ? 'Karte ist voll!' : 'Stempel gebucht') : 'Kartenstand'}
          </p>
        </div>
        {pass.isTest ? <Badge tone="warn">Testkarte</Badge> : null}
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-semibold tabular-nums text-ink">{pass.stamps}</span>
        <span className="text-lg text-ink-3">/ {pass.stampGoal}</span>
        <span className="text-[13px] text-ink-3">{pass.stampLabel}</span>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-line">
        <div
          className={cn('h-full rounded-full transition-all', completed ? 'bg-ok' : 'bg-accent')}
          style={{ width: `${Math.min(100, (pass.stamps / pass.stampGoal) * 100)}%` }}
        />
      </div>

      {completed && pass.rewardText ? (
        <p className="flex items-start gap-2 text-[13px] font-medium text-ok">
          <Gift className="mt-0.5 size-4 shrink-0" />
          {pass.rewardText}
        </p>
      ) : null}

      {pass.rewardCount > 0 ? (
        <p className="text-[12px] text-ink-3">
          Bereits {pass.rewardCount}× eingelöst.
        </p>
      ) : null}

      {feedback.kind === 'ok' ? <WalletSyncNote status={feedback.result.walletSync} /> : null}
    </div>
  )
}

/**
 * The counter in the database and the card on the phone are two different things —
 * saying which one actually changed avoids the "I stamped it but nothing happened"
 * conversation at the counter.
 */
function WalletSyncNote({ status }: { status: StampResult['walletSync'] }) {
  if (status === 'updated') {
    return (
      <p className="flex items-center gap-1.5 text-[12px] text-ok">
        <Check className="size-3.5" />
        Karte auf dem Handy aktualisiert.
      </p>
    )
  }
  if (status === 'not_found') {
    return (
      <p className="text-[12px] text-ink-3">
        Gebucht. Die Karte liegt noch in keinem Google Wallet — sie aktualisiert sich, sobald
        der Kunde sie hinzufügt.
      </p>
    )
  }
  if (status === 'not_configured') {
    return <p className="text-[12px] text-ink-3">Gebucht. Wallet-Aktualisierung ist nicht eingerichtet.</p>
  }
  return (
    <p className="text-[12px] text-warn-ink">
      Gebucht, aber die Aktualisierung auf dem Handy hat nicht geklappt. Der Stand stimmt hier.
    </p>
  )
}
