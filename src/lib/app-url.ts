/**
 * The public base URL of this deployment.
 *
 * Everything that has to be reachable from a *phone* depends on getting this right: the
 * test-card QR code, the Google Wallet save link and the asset URLs that Google's servers
 * fetch. A hardcoded localhost here is exactly why a scanned QR code does nothing.
 *
 * Resolution order:
 *   1. NEXT_PUBLIC_APP_URL          — explicit, wins when set (custom domain)
 *   2. VERCEL_PROJECT_PRODUCTION_URL — the stable production domain on Vercel
 *   3. VERCEL_URL                    — the per-deployment URL (preview builds)
 *   4. localhost                     — development
 */
export function appUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (explicit) return stripTrailingSlash(withProtocol(explicit))

  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  if (production) return stripTrailingSlash(withProtocol(production))

  const deployment = process.env.VERCEL_URL?.trim()
  if (deployment) return stripTrailingSlash(withProtocol(deployment))

  return 'http://localhost:3000'
}

function withProtocol(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}
