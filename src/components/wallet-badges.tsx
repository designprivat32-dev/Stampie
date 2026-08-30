'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { Spinner } from '@/components/ui/misc'
import { cn } from '@/lib/utils'

/**
 * The official "Zu Apple Wallet hinzufügen" / "Hinzufügen zu Google Wallet" badges.
 *
 * Both are Apple's and Google's own artwork, used unaltered — which is what their brand
 * guidelines require in almost the same words: no redrawing, no changed colours, no
 * changed corner radius. That is also why the two do not match: Google's badge is a pill,
 * Apple's a rectangle with a small radius. Making them agree would mean editing one of
 * them, so the mismatch is accepted on purpose.
 *
 * The files live in `public/wallet-badges/` and are served as plain images. They carry
 * their own text, so there is nothing to translate here — the German files are the ones
 * checked in.
 *
 * Google's *condensed* badge is used rather than its wide one, which Google offers for
 * exactly this: at a shared height the wide version is more than twice Apple's width and
 * the pair reads as lopsided on a phone. Condensed sits at 3.6 against Apple's 3.2.
 *
 * The badge is a client component only because of the wait after the tap: the request
 * behind it mints a pass, signs it and (for Google) creates the object at Google, which
 * takes seconds on a till WiFi. Without a sign of life a tester read the silence as a
 * fault and tapped five times — and since every tap mints its own card, that is five
 * cards. Hence the busy state below.
 */

/**
 * Height, not width. Both badges keep their own aspect ratio, which the guidelines also
 * require, so the shared height is what makes them sit level next to each other.
 * Google asks for at least 48dp; both sizes clear that.
 *
 * `lg` is for the page a customer lands on after scanning the QR at the till: there the
 * badge is the only thing to do on the page, held at arm's length, often one-handed — so
 * it gets the thumb-sized target rather than the polite one.
 */
const BADGE_HEIGHT = {
  md: 'h-[52px]',
  lg: 'h-[68px]',
} as const

export type BadgeSize = keyof typeof BADGE_HEIGHT

/**
 * How long the busy state holds before the badges become tappable again.
 *
 * There is no completion event to wait for. Apple's answer is a download, which leaves
 * this page exactly where it was; Google's is a redirect away. So the state is released
 * either when the customer comes back to the page (below) or after this timeout, which is
 * the escape hatch for the case where the request really did fail: long enough that a slow
 * pass does not look tappable again mid-flight, short enough that nobody is stranded.
 */
const RESET_AFTER_MS = 20_000

/**
 * Which badge is busy — shared by both, not per button.
 *
 * On a desktop or an unknown user agent both badges are on the page, and the two hand out
 * *different* cards for the same person. Blocking only the badge that was tapped would
 * still allow the second tap to mint a second card, so the pending badge lives in one
 * place above them.
 */
let pendingBadge: string | null = null
let resetTimer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<() => void>()

function emit(value: string | null) {
  pendingBadge = value
  for (const listener of listeners) listener()
}

function beginPending(id: string) {
  if (resetTimer) clearTimeout(resetTimer)
  resetTimer = setTimeout(() => emit(null), RESET_AFTER_MS)
  emit(id)
}

function endPending() {
  if (resetTimer) {
    clearTimeout(resetTimer)
    resetTimer = null
  }
  emit(null)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getPendingBadge() {
  return pendingBadge
}

// Nothing is pending during the server render, and the first client render has to agree.
function getPendingBadgeOnServer() {
  return null
}

function BadgeLink({
  id,
  href,
  src,
  alt,
  width,
  height,
  size = 'md',
  className,
}: {
  id: string
  href: string
  src: string
  alt: string
  width: number
  height: number
  size?: BadgeSize
  className?: string
}) {
  const pending = useSyncExternalStore(subscribe, getPendingBadge, getPendingBadgeOnServer)
  const busy = pending === id
  const blocked = pending !== null && !busy

  /**
   * Coming back to the page ends the wait.
   *
   * Google's badge navigates away, so the way back is the back button and `pageshow` fires
   * from the bfcache. Apple's keeps the page and opens Wallet's sheet over it, which on
   * iOS hides the document — so returning from the sheet is a `visibilitychange`. Either
   * way the customer is looking at this page again and the badge has to work again.
   */
  useEffect(() => {
    if (!busy) return

    const onPageShow = () => endPending()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') endPending()
    }

    window.addEventListener('pageshow', onPageShow)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pageshow', onPageShow)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [busy])

  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      <a
        href={href}
        aria-label={alt}
        aria-busy={busy}
        aria-disabled={blocked}
        onClick={(event) => {
          // The second tap does nothing at all — not a queued one, not a cancelled one.
          if (pendingBadge !== null) {
            event.preventDefault()
            return
          }
          beginPending(id)
        }}
        className={cn(
          'relative inline-flex transition-opacity',
          blocked && 'cursor-default opacity-40',
          busy && 'cursor-default',
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          width={width}
          height={height}
          className={cn(BADGE_HEIGHT[size], 'w-auto transition-opacity', busy && 'opacity-25')}
        />
        {busy ? (
          <span className="absolute inset-0 flex items-center justify-center">
            <Spinner className="size-6 text-ink" />
          </span>
        ) : null}
      </a>

      {/* Reserving the line would push the badges around on every page; the wait is the
          only moment the sentence is true, so it appears with it. */}
      {busy ? (
        <p role="status" className="text-center text-[13px] leading-snug text-ink-2">
          Karte wird vorbereitet — das dauert einen Moment.
        </p>
      ) : null}
    </div>
  )
}

export function AppleWalletButton({
  href,
  size,
  className,
}: {
  href: string
  size?: BadgeSize
  className?: string
}) {
  return (
    <BadgeLink
      id="apple"
      href={href}
      src="/wallet-badges/apple-wallet-de.svg"
      alt="Zu Apple Wallet hinzufügen"
      width={110}
      height={35}
      size={size}
      className={className}
    />
  )
}

export function GoogleWalletButton({
  href,
  size,
  className,
}: {
  href: string
  size?: BadgeSize
  className?: string
}) {
  return (
    <BadgeLink
      id="google"
      href={href}
      src="/wallet-badges/google-wallet-de.svg"
      alt="Hinzufügen zu Google Wallet"
      width={199}
      height={55}
      size={size}
      className={className}
    />
  )
}
