'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { isAgency, requireSession } from '@/lib/auth/session'
import { fail, fromZodError, guarded, ok, type ActionResult } from '@/lib/action-result'
import { prisma } from '@/lib/db'

/**
 * Customer (Firma) lifecycle: create and edit.
 *
 * A customer is an `Organization`. Only the agency team manages them — the same gate that
 * guards card assignment, so who owns a card and who exists as a customer stay in sync.
 */

/** Empty form fields arrive as '' and are stored as NULL, not as blank strings. */
const emptyToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v)

const customerInputSchema = z.object({
  name: z.string().trim().min(1, 'Bitte einen Namen angeben.').max(120),
  phone: z.preprocess(emptyToNull, z.string().trim().max(40).nullable()),
  email: z.preprocess(
    emptyToNull,
    z.string().trim().email('Bitte eine gültige E-Mail-Adresse angeben.').max(160).nullable(),
  ),
  street: z.preprocess(emptyToNull, z.string().trim().max(160).nullable()),
  postalCode: z.preprocess(emptyToNull, z.string().trim().max(20).nullable()),
  city: z.preprocess(emptyToNull, z.string().trim().max(120).nullable()),
})

export type CustomerInput = z.infer<typeof customerInputSchema>

async function assertAgency(): Promise<string | null> {
  const session = await requireSession()
  if (!(await isAgency(session.userId))) return null
  return session.userId
}

export async function createCustomerAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return guarded(async () => {
    const parsed = customerInputSchema.safeParse(input)
    if (!parsed.success) return fromZodError(parsed.error)

    if (!(await assertAgency())) {
      return fail('Nur das Agentur-Team darf Kunden anlegen.', 'forbidden')
    }

    const org = await prisma.organization.create({
      data: {
        name: parsed.data.name,
        phone: parsed.data.phone,
        email: parsed.data.email,
        street: parsed.data.street,
        postalCode: parsed.data.postalCode,
        city: parsed.data.city,
      },
      select: { id: true },
    })

    revalidatePath('/dashboard/kunden')
    revalidatePath('/dashboard/karten')
    return ok({ id: org.id })
  })
}

export async function updateCustomerAction(
  id: string,
  input: unknown,
): Promise<ActionResult<null>> {
  return guarded(async () => {
    const idParsed = z.string().cuid().safeParse(id)
    if (!idParsed.success) return fail('Ungültige Kunden-ID.', 'validation')

    const parsed = customerInputSchema.safeParse(input)
    if (!parsed.success) return fromZodError(parsed.error)

    if (!(await assertAgency())) {
      return fail('Nur das Agentur-Team darf Kunden bearbeiten.', 'forbidden')
    }

    const existing = await prisma.organization.findFirst({
      where: { id: idParsed.data },
      select: { id: true },
    })
    if (!existing) return fail('Dieser Kunde wurde nicht gefunden.', 'not_found')

    await prisma.organization.update({
      where: { id: idParsed.data },
      data: {
        name: parsed.data.name,
        phone: parsed.data.phone,
        email: parsed.data.email,
        street: parsed.data.street,
        postalCode: parsed.data.postalCode,
        city: parsed.data.city,
      },
    })

    revalidatePath('/dashboard/kunden')
    revalidatePath('/dashboard/karten')
    return ok(null)
  })
}
