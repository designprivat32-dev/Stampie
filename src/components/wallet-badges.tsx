import { cn } from '@/lib/utils'

/**
 * "Add to Apple Wallet" / "Add to Google Wallet" buttons.
 *
 * Rebuilt rather than dropped in as Apple's and Google's supplied artwork, for one reason:
 * both companies ship their badge as a fixed image and ask that it not be altered — Apple's
 * Wallet guidelines name the corner radius specifically. A matching pair of buttons was
 * wanted, so they are drawn here instead of an official asset being bent out of shape.
 *
 * Text sits in the DOM rather than inside the SVG: it picks up the page font, wraps
 * sensibly, and a screen reader gets a real label instead of a graphic.
 */

/** One value, both buttons — the whole point is that they match. */
const SHAPE = 'flex items-center gap-3 rounded-xl px-5 py-2.5'

function Label({ lead, name }: { lead: string; name: string }) {
  return (
    <span className="text-left leading-tight">
      <span className="block text-[11px] font-normal opacity-90">{lead}</span>
      <span className="block text-[17px] font-semibold tracking-tight">{name}</span>
    </span>
  )
}

/** The card stack sliding into a pocket. */
function AppleWalletIcon() {
  return (
    <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden="true">
      <rect x="9" y="4" width="14" height="6" rx="1.6" fill="#F4544A" />
      <rect x="7.5" y="7" width="17" height="6" rx="1.6" fill="#F5B93B" />
      <rect x="6" y="10" width="20" height="6" rx="1.6" fill="#5FC15C" />
      <rect x="4.5" y="13" width="23" height="7" rx="1.8" fill="#4DA9E8" />
      <rect x="2.4" y="17.4" width="27.2" height="10.2" rx="2.8" fill="#EDEDF0" />
      {/* The thumb notch. Barely darker than the pocket on purpose — at full contrast it
          stops reading as an indent and turns into a grey blob. */}
      <path d="M12.4 17.4a3.6 3.6 0 0 0 7.2 0Z" fill="#E2E2E9" />
    </svg>
  )
}

/** The rounded tile with a card across it, in Google's four colours. */
function GoogleWalletIcon() {
  return (
    <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden="true">
      <rect x="2" y="2" width="28" height="28" rx="8" fill="#FFFFFF" />
      <rect x="6.5" y="6" width="19" height="4.2" rx="2.1" fill="#4285F4" />
      <rect x="6.5" y="9.4" width="19" height="4.2" rx="2.1" fill="#34A853" />
      <rect x="6.5" y="12.8" width="19" height="4.2" rx="2.1" fill="#FBBC04" />
      <rect x="6.5" y="16.2" width="19" height="4.2" rx="2.1" fill="#EA4335" />
      {/* The card sits low enough that all four colours stay visible above it. */}
      <rect
        x="5"
        y="19.4"
        width="22"
        height="6.8"
        rx="2.4"
        fill="#FFFFFF"
        stroke="#DADCE0"
        strokeWidth="0.9"
      />
    </svg>
  )
}

export function AppleWalletButton({
  href,
  className,
  lead = 'Add to',
  name = 'Apple Wallet',
}: {
  href: string
  className?: string
  lead?: string
  name?: string
}) {
  return (
    <a href={href} aria-label={`${lead} ${name}`} className={cn(SHAPE, 'bg-black text-white', className)}>
      <AppleWalletIcon />
      <Label lead={lead} name={name} />
    </a>
  )
}

export function GoogleWalletButton({
  href,
  className,
  lead = 'Add to',
  name = 'Google Wallet',
}: {
  href: string
  className?: string
  lead?: string
  name?: string
}) {
  return (
    <a href={href} aria-label={`${lead} ${name}`} className={cn(SHAPE, 'bg-black text-white', className)}>
      <GoogleWalletIcon />
      <Label lead={lead} name={name} />
    </a>
  )
}
