/**
 * The dashboard cookie's name and token shape.
 *
 * Its own module, free of `server-only`, Prisma and `next/headers`, because the middleware
 * needs these two constants and runs on the edge runtime — importing the session module
 * there would drag the Prisma client into a bundle that cannot hold it.
 */

export const DASHBOARD_COOKIE = 'stampie_dashboard'

/**
 * Dashboard sessions share the `AppSession` table with the native app's bearer tokens.
 * This prefix is what tells the two apart, so neither resolver accepts the other's token.
 */
export const DASHBOARD_TOKEN_PREFIX = 'dash_'

export function isDashboardToken(token: string | null | undefined): boolean {
  return typeof token === 'string' && token.startsWith(DASHBOARD_TOKEN_PREFIX)
}
