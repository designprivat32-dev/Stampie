'use client'

import * as React from 'react'
import { AlertTriangle, Check, Gift, RotateCw, Search, Ticket } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge, Spinner } from '@/components/ui/misc'
import { QrScanner } from './qr-scanner'
import {
  lookupPassAction,
  redeemAction,
  redeemCouponAction,
  stampAction,
  type PassSummary,
  type StampResult,
} from '@/actions/stamping'
import { cn } from '@/lib/utils'
import type { CardKind } from '@/lib/cards/schema'

/**
 * The till view: scan a customer's pass, then either book a stamp or cash something in.
 *
 * Two very different jobs behind one scanner. A stamp card is booked over and over; a
 * coupon is spent exactly once, and the difference has to be obvious at arm's length —
 * staff must never be able to "stamp" a coupon or hand out the same discount twice.
 *
 * Optimised for one-handed use next to a coffee machine: every outcome says what to do
 * next rather than showing an error code.
 */

type Mode = 'stamp' | 'lookup' | 'redeem' | 'redeem-coupon'

type Feedback =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'ok'; result: StampResult; action: 'stamp' | 'redeem' }
  | { kind: 'info'; pass: PassSummary }
  | { kind: 'coupon-redeemed'; pass: PassSummary }
  | { kind: 'error'; message: string }

export function TillView({
  cardId,
  cardKind = 'STAMP',
  initialSerial,
}: {
  cardId: string
  /** A coupon is redeemed once; a stamp card is stamped. */
  cardKind?: CardKind
  /** Present when staff arrived by scanning the card's barcode. */
  initialSerial?: string | null
}) {
  const isCoupon = cardKind === 'COUPON'
  const [feedback, setFeedback] = React.useState<Feedback>({ kind: 'idle' })
  const [manual, setManual] = React.useState(initialSerial ?? '')
  const busyRef = React.useRef(false)

  const run = React.useCallback(
    async (scanned: string, mode: Mode) => {
      if (busyRef.current) return
      busyRef.current = true
      setFeedback({ kind: 'busy' })

      try {
        if (mode === 'redeem-coupon') {
          const result = await redeemCouponAction({ cardId, scanned })
          if (!result.success) {
            setFeedback({ kind: 'error', message: result.error.message })
            return
          }
          setFeedback({ kind: 'coupon-redeemed', pass: result.data })
          return
        }

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

  // Scanning a coupon looks it up rather than spending it: cashing in is worth money and
  // stays a deliberate second action, never a side effect of pointing the camera.
  const scanMode: Mode = isCoupon ? 'lookup' : 'stamp'

  return (
    <div className="mx-auto w-full max-w-md space-y-4 p-4">
      <QrScanner onScan={(value) => void run(value, scanMode)} disabled={feedback.kind === 'busy'} />

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
              if (e.key === 'Enter' && manual.trim()) void run(manual.trim(), scanMode)
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
          {isCoupon ? null : (
            <Button
              variant="primary"
              disabled={!manual.trim() || feedback.kind === 'busy'}
              onClick={() => void run(manual.trim(), 'stamp')}
            >
              Stempeln
            </Button>
          )}
        </div>
      </div>

      <ResultPanel feedback={feedback} isCoupon={isCoupon} />

      {currentSerial ? (
        <div className="flex gap-2">
          {isCoupon ? (
            // Hidden once spent, so the only way to a second redemption is a fresh scan —
            // which the server refuses anyway.
            feedback.kind === 'info' && feedback.pass.redeemedAt === null ? (
              <Button
                variant="primary"
                className="flex-1"
                disabled={feedback.kind !== 'info'}
                onClick={() => void run(currentSerial, 'redeem-coupon')}
              >
                <Ticket />
                Gutschein einlösen
              </Button>
            ) : null
          ) : (
            <Button
              variant="outline"
              className="flex-1"
              disabled={feedback.kind === 'busy'}
              onClick={() => void run(currentSerial, 'redeem')}
            >
              <Gift />
              Belohnung einlösen
            </Button>
          )}
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

function ResultPanel({ feedback, isCoupon }: { feedback: Feedback; isCoupon: boolean }) {
  if (feedback.kind === 'idle') {
    return (
      <p className="rounded-lg border border-dashed border-line px-3 py-8 text-center text-[13px] text-ink-3">
        {isCoupon ? 'Gutschein scannen oder Nummer eingeben.' : 'Kundenkarte scannen oder Nummer eingeben.'}
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

  if (feedback.kind === 'coupon-redeemed') {
    return <CouponPanel pass={feedback.pass} justRedeemed />
  }

  // On a coupon card only a lookup can reach this point — stamping is refused server-side
  // and hidden in the UI, so an 'ok' result here would mean something went badly wrong.
  if (isCoupon) {
    if (feedback.kind !== 'info') return null
    return <CouponPanel pass={feedback.pass} justRedeemed={false} />
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

      {feedback.kind === 'ok' && feedback.result.coupon ? (
        <CouponHandout coupon={feedback.result.coupon} />
      ) : null}
    </div>
  )
}

/**
 * The coupon a just-emptied card earned, as a code the customer scans right there.
 *
 * Shown at the counter while they still have their phone in hand — no e-mail, no app, no
 * second visit. The link stays printed underneath for the case where the camera fails.
 */
function CouponHandout({ coupon }: { coupon: NonNullable<StampResult['coupon']> }) {
  return (
    <div className="space-y-2 rounded-lg border border-ok/40 bg-surface p-3 text-center">
      <p className="text-[13px] font-medium text-ink">Gutschein für den Kunden</p>
      <p className="text-[12px] leading-snug text-ink-3">
        Kunde scannt diesen Code und legt den Gutschein in seine Wallet.
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={coupon.qrDataUrl}
        alt={`QR-Code für Gutschein ${coupon.serial}`}
        className="mx-auto size-44 rounded-md bg-white p-2"
      />
      <p className="break-all font-mono text-[11px] text-ink-3">{coupon.claimUrl}</p>
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

/**
 * A coupon has no counter to show — only two states that matter at the counter: still
 * valid, or already spent. Both are stated in large type, because handing out a discount
 * twice is the expensive mistake this screen exists to prevent.
 */
function CouponPanel({ pass, justRedeemed }: { pass: PassSummary; justRedeemed: boolean }) {
  const spent = pass.redeemedAt !== null

  return (
    <div
      className={cn(
        'space-y-3 rounded-xl border px-4 py-4',
        justRedeemed
          ? 'border-ok/40 bg-ok-soft'
          : spent
            ? 'border-danger/30 bg-danger-soft'
            : 'border-line bg-surface',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[12px] text-ink-3">{pass.serial}</p>
          <p
            className={cn(
              'text-[15px] font-semibold',
              justRedeemed ? 'text-ok' : spent ? 'text-danger' : 'text-ink',
            )}
          >
            {justRedeemed ? 'Eingelöst' : spent ? 'Bereits eingelöst' : 'Gültig'}
          </p>
        </div>
        {pass.isTest ? <Badge tone="warn">Testkarte</Badge> : null}
      </div>

      {pass.offerTitle ? (
        <p className="flex items-start gap-2 text-[15px] font-medium text-ink">
          <Ticket className="mt-0.5 size-4 shrink-0" />
          {pass.offerTitle}
        </p>
      ) : null}

      {spent && !justRedeemed ? (
        <p className="text-[13px] text-danger">
          Dieser Gutschein wurde schon verwendet und darf nicht noch einmal gewährt werden.
        </p>
      ) : null}

      {justRedeemed ? (
        <p className="flex items-center gap-1.5 text-[12px] text-ok">
          <Check className="size-3.5" />
          Der Gutschein ist verbraucht und wandert beim Kunden zu den abgelaufenen Pässen.
        </p>
      ) : null}
    </div>
  )
}
