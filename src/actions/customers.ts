'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireSession } from '@/lib/auth/session'
import { fail, fromZodError, guarded, ok, type ActionResult } from '@/lib/action-result'
import { prisma } from '@/lib/db'
import { geocodeAddress, GeocodeError, type GeocodeResult } from '@/lib/geo/geocode'

/**
 * Customer (Firma) lifecycle: create and edit.
 *
 * A customer is an `Organization`. Single-operator setup: any logged-in user may manage
 * customers — there is no agency/owner gate here.
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
  // Prefill sources for the card designer's back fields. A pass published to a customer
  // needs an imprint and a privacy link, so capturing them once per customer beats typing
  // them into every card.
  website: z.preprocess(emptyToNull, z.string().trim().url('Bitte eine vollständige URL angeben.').max(200).nullable()),
  imprintUrl: z.preprocess(emptyToNull, z.string().trim().url('Bitte eine vollständige URL angeben.').max(200).nullable()),
  privacyUrl: z.preprocess(emptyToNull, z.string().trim().url('Bitte eine vollständige URL angeben.').max(200).nullable()),

  /**
   * Koordinaten des Betriebs. Sie füttern die Standort-Benachrichtigung: der Designer und
   * der Schalter in der Kartenübersicht legen den ersten Standort damit an.
   *
   * Nullable, weil ein Kunde lange vor seiner ersten Karte angelegt wird — und weil nicht
   * jede Adresse gefunden wird. Eingetragen werden sie über die Adresssuche im Dialog,
   * geprüft werden sie hier trotzdem: aus dem Formular kommt, was der Browser schickt.
   */
  latitude: z.preprocess(emptyToNull, z.coerce.number().min(-90).max(90).nullable().default(null)),
  longitude: z.preprocess(emptyToNull, z.coerce.number().min(-180).max(180).nullable().default(null)),
})

export type CustomerInput = z.infer<typeof customerInputSchema>

const geocodeInputSchema = z.object({
  street: z.string().max(160).default(''),
  postalCode: z.string().max(20).default(''),
  city: z.string().max(120).default(''),
})

/**
 * Adresssuche für den Kundendialog.
 *
 * Gibt nur zurück, gespeichert wird erst mit dem Kunden — wer eine Adresse sucht, soll
 * sehen, wo der Punkt landet, bevor daraus eine Benachrichtigung wird. Wurde die Adresse
 * nicht genau gefunden, kommen Vorschläge zurück statt einer Sackgasse; welcher davon
 * stimmt, entscheidet der Mensch, nicht die Suche.
 *
 * Die eingetippte Adresse geht dabei an OpenStreetMap; das steht so auch im Dialog.
 */
export async function geocodeAddressAction(input: unknown): Promise<ActionResult<GeocodeResult>> {
  return guarded(async () => {
    const parsed = geocodeInputSchema.safeParse(input)
    if (!parsed.success) return fromZodError(parsed.error)

    await requireSession()

    try {
      const result = await geocodeAddress(parsed.data)
      if (result.candidates.length === 0) {
        return fail(
          'Zu dieser Adresse wurde nichts gefunden — auch nicht in der Umgebung. Ort und PLZ prüfen, oder die Koordinaten im Designer von Hand eintragen.',
          'not_found',
        )
      }
      return ok(result)
    } catch (error) {
      if (error instanceof GeocodeError) {
        return fail(`Der Adress-Suchdienst antwortet gerade nicht (${error.message}).`, 'internal')
      }
      throw error
    }
  })
}

export async function createCustomerAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return guarded(async () => {
    const parsed = customerInputSchema.safeParse(input)
    if (!parsed.success) return fromZodError(parsed.error)

    await requireSession()

    const org = await prisma.organization.create({
      data: {
        name: parsed.data.name,
        phone: parsed.data.phone,
        email: parsed.data.email,
        street: parsed.data.street,
        postalCode: parsed.data.postalCode,
        city: parsed.data.city,
        website: parsed.data.website,
        imprintUrl: parsed.data.imprintUrl,
        privacyUrl: parsed.data.privacyUrl,
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
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

    await requireSession()

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
        website: parsed.data.website,
        imprintUrl: parsed.data.imprintUrl,
        privacyUrl: parsed.data.privacyUrl,
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
      },
    })

    revalidatePath('/dashboard/kunden')
    revalidatePath('/dashboard/karten')
    return ok(null)
  })
}
