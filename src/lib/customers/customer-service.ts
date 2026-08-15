import 'server-only'
import { prisma } from '@/lib/db'

/**
 * Reads around the customer (Firma). A customer is an `Organization`: the company a card
 * is handed to. It carries the contact details captured by the agency and owns any number
 * of cards.
 */

export interface CustomerRecord {
  id: string
  name: string
  phone: string | null
  email: string | null
  street: string | null
  postalCode: string | null
  city: string | null
  website: string | null
  imprintUrl: string | null
  privacyUrl: string | null
  /** How many cards belong to this customer. */
  cardCount: number
  createdAt: string
}

/**
 * Customers the caller may see. `orgIds` null means agency — every customer. Ordered by
 * name so the list and the search read the same way.
 */
export async function listCustomerRecords(orgIds: string[] | null): Promise<CustomerRecord[]> {
  const rows = await prisma.organization.findMany({
    where: orgIds ? { id: { in: orgIds } } : {},
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      street: true,
      postalCode: true,
      city: true,
      website: true,
      imprintUrl: true,
      privacyUrl: true,
      createdAt: true,
      _count: { select: { cards: true } },
    },
  })

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    email: r.email,
    street: r.street,
    postalCode: r.postalCode,
    city: r.city,
    website: r.website,
    imprintUrl: r.imprintUrl,
    privacyUrl: r.privacyUrl,
    cardCount: r._count.cards,
    createdAt: r.createdAt.toISOString(),
  }))
}
