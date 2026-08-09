import type { CardDesignInput } from './schema'

/**
 * The name a customer sees as the issuer of the pass.
 *
 * The organisation is the tenant — usually the legal entity ("Nordstadt Betriebe GmbH"),
 * shared by every card that tenant owns. That is rarely the name the shop trades under, and
 * it is the single most prominent line on a Google Wallet card, so each card may override
 * it. Empty or whitespace-only overrides fall back rather than leaving the pass unsigned by
 * anyone.
 *
 * Resolved in `buildLoyaltyClass` and `buildPassJson` rather than at their call sites, so
 * every issuing path — real pass, test card, class sync — goes through the same rule.
 */
export function resolveIssuerName(
  design: Pick<CardDesignInput, 'issuerDisplayName'>,
  organizationName: string,
): string {
  return design.issuerDisplayName?.trim() || organizationName
}
