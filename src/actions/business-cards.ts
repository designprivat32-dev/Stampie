'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { assertCardAccess, CardAccessError, type CardAccess } from '@/lib/auth/session'
import { fail, fromZodError, guarded, ok, type ActionResult } from '@/lib/action-result'
import { prisma } from '@/lib/db'
import { syncBusinessContact } from '@/lib/business-cards/wallet-sync'
import { newOwnerClaimToken, newScanCode } from '@/lib/business-cards/serial'
import { editorSaveSchema, type EditorSaveResult } from '@/lib/business-cards/editor-schema'
import { saveBusinessCardEditor } from '@/lib/business-cards/editor-save'

/**
 * Was der Visitenkarten-Editor im Dashboard speichert.
 *
 * Ein Speichern für alles (`saveBusinessCardAction`): Aussehen, Firmendaten und Personen
 * gehen zusammen raus, so wie der Editor einen einzigen Speichern-Knopf hat. Daneben nur
 * die zwei Aktionen, die bewusst sofort wirken sollen — neuer QR-Code, neuer Link.
 *
 * Jede Aktion prüft zuerst den Zugriff auf die Karte und dann, dass es wirklich eine
 * Visitenkarte ist.
 */

async function assertBusinessCardAccess(cardId: string): Promise<CardAccess> {
  const access = await assertCardAccess(cardId)
  const card = await prisma.card.findFirst({
    where: { id: cardId, kind: 'BUSINESS_CARD' },
    select: { id: true },
  })
  if (!card) throw new CardAccessError('Visitenkarte nicht gefunden.')
  return access
}

async function assertContactAccess(contactId: string): Promise<{ cardId: string; access: CardAccess }> {
  const contact = await prisma.businessContact.findFirst({
    where: { id: contactId, deletedAt: null },
    select: { cardId: true },
  })
  if (!contact) throw new CardAccessError('Person nicht gefunden.')
  return { cardId: contact.cardId, access: await assertBusinessCardAccess(contact.cardId) }
}

function revalidate(cardId: string): void {
  revalidatePath(`/dashboard/karten/${cardId}`)
  revalidatePath('/dashboard/karten')
}

/** Speichert den ganzen Editor-Stand. Fehler kommen mit Feldpfad zurück. */
export async function saveBusinessCardAction(input: unknown): Promise<ActionResult<EditorSaveResult>> {
  return guarded(async () => {
    const parsed = editorSaveSchema.safeParse(input)
    if (!parsed.success) return fromZodError(parsed.error)
    const { session } = await assertBusinessCardAccess(parsed.data.cardId)

    const outcome = await saveBusinessCardEditor(parsed.data, session.userId)
    if (!outcome.ok) return fail(outcome.message, 'validation', { [outcome.field]: outcome.message })

    revalidate(parsed.data.cardId)
    return ok(outcome.result)
  })
}

/**
 * Neuer QR-Code für eine Person — etwa wenn der alte irgendwo kursiert, wo er nicht hin soll.
 *
 * Alte Links auf die Scan-Seite funktionieren danach nicht mehr. Die Pässe der Person
 * werden nachgezogen: der Aussteller-Pass zeigt den neuen Code.
 */
export async function renewScanCodeAction(contactId: string): Promise<ActionResult<null>> {
  return guarded(async () => {
    const parsed = z.string().cuid().safeParse(contactId)
    if (!parsed.success) return fail('Ungültige Person.', 'validation')
    const { cardId } = await assertContactAccess(parsed.data)

    await prisma.businessContact.update({
      where: { id: parsed.data },
      data: { scanCode: newScanCode() },
    })
    try {
      await syncBusinessContact(parsed.data)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[business-card] wallet update failed', error)
    }

    revalidate(cardId)
    return ok(null)
  })
}

/** Neuer Link für den Aussteller-Pass; der alte funktioniert danach nicht mehr. */
export async function renewOwnerLinkAction(contactId: string): Promise<ActionResult<null>> {
  return guarded(async () => {
    const parsed = z.string().cuid().safeParse(contactId)
    if (!parsed.success) return fail('Ungültige Person.', 'validation')
    const { cardId } = await assertContactAccess(parsed.data)

    await prisma.businessContact.update({
      where: { id: parsed.data },
      data: { ownerClaimToken: newOwnerClaimToken() },
    })

    revalidate(cardId)
    return ok(null)
  })
}
