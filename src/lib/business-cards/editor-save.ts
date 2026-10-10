import 'server-only'
import { prisma } from '@/lib/db'
import { cardDesignDraftSchema } from '@/lib/cards/schema'
import { loadOrCreateDraft, loadPublishedDesign, publishDesign, saveDraft } from '@/lib/cards/repository'
import { invalidateStripCache } from '@/lib/cards/strip-service'
import type { EditorSave, EditorSaveResult } from './editor-schema'
import type { BusinessCompany, BusinessContact } from './schema'
import { newOwnerClaimToken, newScanCode } from './serial'
import { syncBusinessCard, syncBusinessContact } from './wallet-sync'

/**
 * Speichert den ganzen Editor-Stand einer Visitenkarte in einem Rutsch.
 *
 * Erst wird alles geprüft (Logo, Fotos, Personen gehören zu dieser Karte), dann geschrieben,
 * dann die Wallets nachgezogen — und das nur für das, was sich wirklich geändert hat. Ein
 * Speichern ohne Änderung stößt keinen einzigen Push an.
 *
 * Gibt eine Fehlermeldung samt Feldpfad zurück statt zu werfen, damit der Editor sie am
 * richtigen Feld anzeigt.
 */

export type EditorSaveOutcome =
  | { ok: true; result: EditorSaveResult }
  | { ok: false; message: string; field: string }

function sameCompany(a: BusinessCompany | null, b: BusinessCompany | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function contactFields(c: BusinessContact & { photoAssetId: string | null }) {
  return {
    firstName: c.firstName,
    lastName: c.lastName,
    jobTitle: c.jobTitle,
    phone: c.phone,
    mobile: c.mobile,
    email: c.email,
    links: c.links,
    photoAssetId: c.photoAssetId,
  }
}

export async function saveBusinessCardEditor(input: EditorSave, userId: string): Promise<EditorSaveOutcome> {
  const { cardId } = input

  // ---- prüfen
  if (input.design.logoAssetId) {
    const logo = await prisma.asset.findFirst({
      where: { id: input.design.logoAssetId, cardId, kind: 'LOGO' },
      select: { id: true },
    })
    if (!logo) return { ok: false, message: 'Das Logo wurde nicht gefunden.', field: 'design.logoAssetId' }
  }

  const photoIds = [...new Set(input.contacts.map((c) => c.photoAssetId).filter((id): id is string => Boolean(id)))]
  if (photoIds.length > 0) {
    const found = await prisma.asset.findMany({
      where: { id: { in: photoIds }, cardId, kind: 'CONTACT_PHOTO' },
      select: { id: true },
    })
    const known = new Set(found.map((a) => a.id))
    const index = input.contacts.findIndex((c) => c.photoAssetId && !known.has(c.photoAssetId))
    if (index >= 0) return { ok: false, message: 'Das Foto wurde nicht gefunden.', field: `contacts.${index}.photoAssetId` }
  }

  const existingIds = [
    ...input.contacts.map((c) => c.id).filter((id): id is string => id !== null),
    ...input.deletedContactIds,
  ]
  const existing = await prisma.businessContact.findMany({
    where: { id: { in: existingIds }, cardId, deletedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      jobTitle: true,
      phone: true,
      mobile: true,
      email: true,
      links: true,
      photoAssetId: true,
    },
  })
  const byId = new Map(existing.map((row) => [row.id, row]))
  const missing = input.contacts.findIndex((c) => c.id !== null && !byId.has(c.id))
  if (missing >= 0) {
    return { ok: false, message: 'Diese Person gibt es nicht mehr. Bitte die Seite neu laden.', field: `contacts.${missing}` }
  }
  const deletable = input.deletedContactIds.filter((id) => byId.has(id))

  // ---- Aussehen: nur veröffentlichen, wenn sich etwas geändert hat
  const [draft, published] = await Promise.all([loadOrCreateDraft(cardId), loadPublishedDesign(cardId)])
  const nextDesign = cardDesignDraftSchema.parse({
    ...draft.design,
    backgroundColor: input.design.backgroundColor,
    foregroundColor: input.design.foregroundColor,
    labelColor: input.design.labelColor,
    cardTitle: input.design.cardTitle || null,
    logoAssetId: input.design.logoAssetId,
  })
  const designChanged =
    !published ||
    published.backgroundColor !== nextDesign.backgroundColor ||
    published.foregroundColor !== nextDesign.foregroundColor ||
    published.labelColor !== nextDesign.labelColor ||
    (published.cardTitle ?? null) !== (nextDesign.cardTitle ?? null) ||
    (published.logoAssetId ?? null) !== (nextDesign.logoAssetId ?? null)

  let version = draft.publishedVersion
  if (designChanged) {
    await saveDraft(cardId, nextDesign)
    version = (await publishDesign(cardId, nextDesign, userId, { contrastOverride: false, note: 'Visitenkarte' })).version
    invalidateStripCache()
  }

  // ---- Firma, Personen, Löschungen — zusammen, damit kein halber Stand übrig bleibt
  const currentCompany = await prisma.businessCardCompany.findFirst({
    where: { cardId },
    select: { company: true, website: true, phone: true, street: true, postalCode: true, city: true },
  })
  const companyChanged = !sameCompany(currentCompany, input.company)

  const changedContactIds: string[] = []
  const createdContactIds: Record<string, string> = {}

  await prisma.$transaction(async (tx) => {
    if (companyChanged) {
      if (input.company) {
        await tx.businessCardCompany.upsert({
          where: { cardId },
          create: { cardId, ...input.company },
          update: input.company,
        })
      } else {
        await tx.businessCardCompany.deleteMany({ where: { cardId } })
      }
    }

    for (const [index, contact] of input.contacts.entries()) {
      const fields = contactFields(contact)
      if (contact.id === null) {
        const created = await tx.businessContact.create({
          data: {
            cardId,
            ...fields,
            scanCode: newScanCode(),
            ownerClaimToken: newOwnerClaimToken(),
            sortOrder: index,
          },
          select: { id: true },
        })
        createdContactIds[contact.key] = created.id
        continue
      }
      const before = byId.get(contact.id)!
      const changed =
        JSON.stringify(contactFields({ ...before, links: before.links as BusinessContact['links'] })) !==
        JSON.stringify(fields)
      if (changed) changedContactIds.push(contact.id)
      await tx.businessContact.update({
        where: { id: contact.id },
        data: changed ? { ...fields, sortOrder: index } : { sortOrder: index },
      })
    }

    if (deletable.length > 0) {
      await tx.businessContact.updateMany({
        where: { id: { in: deletable }, cardId },
        data: { deletedAt: new Date(), ownerClaimToken: null },
      })
    }
  })

  // ---- Wallets nachziehen: einmal die ganze Karte, oder gezielt die geänderten Personen
  try {
    if (designChanged || companyChanged) {
      await syncBusinessCard(cardId)
    } else {
      for (const id of [...changedContactIds, ...deletable]) await syncBusinessContact(id)
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[business-card] wallet update failed', error)
  }

  return {
    ok: true,
    result: {
      version,
      createdContactIds,
      changed: {
        design: designChanged,
        company: companyChanged,
        contacts: changedContactIds.length + Object.keys(createdContactIds).length,
        deleted: deletable.length,
      },
    },
  }
}
