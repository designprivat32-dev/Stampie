/**
 * The base path Apple's Wallet calls back on — `webServiceURL` in every pass.
 *
 * Its own module, and deliberately free of imports beyond the app URL: the pass builder
 * needs this value, and anything that reaches the builder reaches the unit tests too.
 * Pulling in the database client here would drag Prisma's automatic `.env` loading along
 * with it, which silently ran the test suite against real production credentials once
 * already.
 */
import { appUrl } from '@/lib/app-url'

export function applePassKitBaseUrl(): string {
  return `${appUrl()}/api/apple-passkit`
}
