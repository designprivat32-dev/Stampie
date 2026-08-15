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
 */

/**
 * Height, not width. Both badges keep their own aspect ratio, which the guidelines also
 * require, so the shared height is what makes them sit level next to each other.
 * Google asks for at least 48dp; this clears that for both.
 */
const BADGE_HEIGHT = 'h-[52px]'

function BadgeLink({
  href,
  src,
  alt,
  width,
  height,
  className,
}: {
  href: string
  src: string
  alt: string
  width: number
  height: number
  className?: string
}) {
  return (
    <a href={href} className={cn('inline-flex', className)} aria-label={alt}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} width={width} height={height} className={cn(BADGE_HEIGHT, 'w-auto')} />
    </a>
  )
}

export function AppleWalletButton({ href, className }: { href: string; className?: string }) {
  return (
    <BadgeLink
      href={href}
      src="/wallet-badges/apple-wallet-de.svg"
      alt="Zu Apple Wallet hinzufügen"
      width={110}
      height={35}
      className={className}
    />
  )
}

export function GoogleWalletButton({ href, className }: { href: string; className?: string }) {
  return (
    <BadgeLink
      href={href}
      src="/wallet-badges/google-wallet-de.svg"
      alt="Hinzufügen zu Google Wallet"
      width={199}
      height={55}
      className={className}
    />
  )
}
