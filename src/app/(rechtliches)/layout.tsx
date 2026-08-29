import Link from 'next/link'

/**
 * Shared chrome for the public legal pages.
 *
 * These have to stay reachable without a login and without any consent gate —
 * the mobile app links straight to them — so this layout deliberately pulls in
 * nothing from the dashboard: no session lookup, no data access, no scripts.
 */
export default function RechtlichesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-2xl items-center px-5 py-4">
          <span className="text-base font-semibold tracking-tight">stampie</span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 py-10">{children}</main>

      <footer className="border-t border-line">
        <nav
          aria-label="Rechtliches"
          className="mx-auto flex max-w-2xl flex-wrap gap-x-6 gap-y-2 px-5 py-6 text-sm"
        >
          <Link className="underline underline-offset-4 hover:no-underline" href="/impressum">
            Impressum
          </Link>
          <Link className="underline underline-offset-4 hover:no-underline" href="/support">
            Support
          </Link>
        </nav>
      </footer>
    </div>
  )
}
