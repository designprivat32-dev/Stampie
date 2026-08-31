/**
 * Who may sign in to the operator dashboard.
 *
 * Deliberately *not* derived from `Membership`. Every business login is an OWNER of its
 * own organisation, and the dashboard shows every customer's cards, passes and stamp
 * history — deriving dashboard access from a role would hand one salon the data of all
 * the others. Operator access is an explicit allowlist in `DASHBOARD_ADMIN_EMAILS`, so it
 * is a deployment decision rather than something that follows from a row the app created.
 *
 * Fails closed: an unset or empty list means nobody gets in. That locks the dashboard on a
 * fresh deployment, which is the direction an auth mistake should fail in.
 *
 * Pure on purpose — no database, no `server-only` — so the rule itself is unit-testable.
 */

/** Splits the env value on commas, semicolons and whitespace; lower-cased, deduplicated. */
export function parseOperatorEmails(raw: string | undefined | null): string[] {
  if (!raw) return []
  const seen = new Set<string>()
  for (const part of raw.split(/[,;\s]+/)) {
    const email = part.trim().toLowerCase()
    if (email) seen.add(email)
  }
  return [...seen]
}

/** Whether this e-mail is on the operator allowlist. */
export function isOperatorEmail(
  email: string | null | undefined,
  raw: string | undefined | null = process.env.DASHBOARD_ADMIN_EMAILS,
): boolean {
  if (!email) return false
  const allowed = parseOperatorEmails(raw)
  if (allowed.length === 0) return false
  return allowed.includes(email.trim().toLowerCase())
}
