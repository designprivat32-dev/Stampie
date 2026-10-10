import 'server-only'
import type { BusinessCardEventKind } from '@prisma/client'
import { prisma } from '@/lib/db'
import { loadPassAssets } from '@/lib/cards/asset-service'
import { loadPublishedDesign } from '@/lib/cards/repository'
import type { CardDesignInput } from '@/lib/cards/schema'
import { ensureAppleAuthToken } from '@/lib/pass/apple-passkit-auth'
import { buildBusinessApplePass } from './apple-pass-builder'
import { buildBusinessGoogleSaveUrl } from './google-pass'
import { contactPhotoUrl, loadContactPhoto } from './photo-service'
import type { BusinessPassRole } from './apple-pass-json'
import { privacyUrlFor, scanUrlFor, toBusinessCompany, toBusinessContact } from './mapping'
import type { BusinessCompany, BusinessContact } from './schema'
import { isPlausibleCode, newBusinessSerial } from './serial'

/**
 * Die öffentliche Seite der Visitenkarte: was hinter `/v/<scanCode>` und hinter dem
 * Einmal-Link des Ausstellers steht.
 *
 * Ohne Anmeldung, wie die Ausgabe der Stempelkarte — das Gegenüber hat nur seine Kamera.
 *
 * Anders als bei der Stempelkarte wird kein Gerät wiedererkannt: ein zweiter Empfänger-Pass
 * derselben Person ist harmlos, er zeigt dasselbe. Damit entfällt die Einwilligung nach
 * § 25 TDDDG ganz, und der Empfänger hinterlässt nichts außer der Seriennummer seines Passes.
 *
 * Nur veröffentlichte Designs werden ausgegeben, wie überall: ein Entwurf ist unfertig.
 */

export interface ResolvedBusinessCard {
  cardId: string
  contactId: string
  scanCode: string
  design: CardDesignInput
  contact: BusinessContact
  company: BusinessCompany | null
  /** Foto der Person, falls hochgeladen. */
  photoAssetId: string | null
  photoUrl: string | null
  /** Verantwortlicher für die Datenschutzinformation: der Kunde, dem die Karte gehört. */
  owner: {
    name: string
    street: string | null
    postalCode: string | null
    city: string | null
    phone: string | null
    email: string | null
    imprintUrl: string | null
  }
}

const contactSelect = {
  id: true,
  cardId: true,
  scanCode: true,
  firstName: true,
  lastName: true,
  jobTitle: true,
  phone: true,
  mobile: true,
  email: true,
  links: true,
  photoAssetId: true,
  card: {
    select: {
      name: true,
      businessCompany: {
        select: { company: true, website: true, phone: true, street: true, postalCode: true, city: true },
      },
      org: {
        select: {
          name: true,
          street: true,
          postalCode: true,
          city: true,
          phone: true,
          email: true,
          imprintUrl: true,
        },
      },
    },
  },
} as const

type ContactWithCard = NonNullable<
  Awaited<ReturnType<typeof prisma.businessContact.findFirst<{ select: typeof contactSelect }>>>
>

async function resolve(row: ContactWithCard | null): Promise<ResolvedBusinessCard | null> {
  if (!row) return null
  const design = await loadPublishedDesign(row.cardId)
  if (!design) return null

  const company = toBusinessCompany(row.card.businessCompany)
  const org = row.card.org
  const photoUrl = await contactPhotoUrl(row.cardId, row.photoAssetId)
  return {
    cardId: row.cardId,
    contactId: row.id,
    scanCode: row.scanCode,
    design,
    contact: toBusinessContact(row),
    company,
    photoAssetId: row.photoAssetId,
    photoUrl,
    owner: {
      name: org?.name ?? company?.company ?? row.card.name,
      street: org?.street ?? company?.street ?? null,
      postalCode: org?.postalCode ?? company?.postalCode ?? null,
      city: org?.city ?? company?.city ?? null,
      phone: org?.phone ?? company?.phone ?? null,
      email: org?.email ?? null,
      imprintUrl: org?.imprintUrl ?? null,
    },
  }
}

/** Die Person hinter einem gescannten Code, oder null. */
export async function resolveScanCode(code: string): Promise<ResolvedBusinessCard | null> {
  if (!isPlausibleCode(code)) return null
  const row = await prisma.businessContact.findFirst({
    where: { scanCode: code, deletedAt: null, card: { kind: 'BUSINESS_CARD' } },
    select: contactSelect,
  })
  return resolve(row)
}

/**
 * Für die Datenschutzseite: auch gelöschte Personen. Wer eine entwertete Karte im Wallet
 * hat, muss trotzdem nachlesen können, was gespeichert war — der Link steht auf der Karte.
 */
export async function resolveScanCodeForPrivacy(code: string): Promise<ResolvedBusinessCard | null> {
  if (!isPlausibleCode(code)) return null
  const row = await prisma.businessContact.findFirst({
    where: { scanCode: code, card: { kind: 'BUSINESS_CARD' } },
    select: contactSelect,
  })
  return resolve(row)
}

/** Die Person hinter dem Einmal-Link des Ausstellers, oder null. */
export async function resolveOwnerClaim(token: string): Promise<ResolvedBusinessCard | null> {
  if (!isPlausibleCode(token)) return null
  const row = await prisma.businessContact.findFirst({
    where: { ownerClaimToken: token, deletedAt: null, card: { kind: 'BUSINESS_CARD' } },
    select: contactSelect,
  })
  return resolve(row)
}

/** Neuer Empfänger-Pass — jeder Scan bekommt seinen eigenen. */
export async function issueHolderPass(resolved: ResolvedBusinessCard): Promise<string> {
  const pass = await prisma.issuedPass.create({
    data: {
      serial: newBusinessSerial(),
      cardId: resolved.cardId,
      contactId: resolved.contactId,
      kind: 'BUSINESS_CARD',
      role: 'HOLDER',
      designVersion: 1,
    },
    select: { serial: true },
  })
  return pass.serial
}

/**
 * Der Aussteller-Pass der Person.
 *
 * Wiederholbar: derselbe Link liefert denselben Pass, statt bei jedem Öffnen einen neuen
 * anzulegen. Das macht den Link unempfindlich gegen Link-Vorschauen in Messengern und
 * gegen einen abgebrochenen Download. Viel zu schützen gibt es ohnehin nicht — der Pass
 * zeigt nur den öffentlichen QR-Code der Person. Wer den Link ungültig machen will, erzeugt
 * im Dashboard einen neuen.
 */
export async function issueOwnerPass(resolved: ResolvedBusinessCard): Promise<string> {
  const existing = await prisma.issuedPass.findFirst({
    where: { contactId: resolved.contactId, role: 'OWNER', kind: 'BUSINESS_CARD' },
    select: { serial: true },
    orderBy: { createdAt: 'desc' },
  })
  if (existing) return existing.serial

  const pass = await prisma.issuedPass.create({
    data: {
      serial: newBusinessSerial(),
      cardId: resolved.cardId,
      contactId: resolved.contactId,
      kind: 'BUSINESS_CARD',
      role: 'OWNER',
      designVersion: 1,
    },
    select: { serial: true },
  })
  return pass.serial
}

export async function buildIssuedBusinessPass(
  resolved: ResolvedBusinessCard,
  serial: string,
  role: BusinessPassRole,
): Promise<Buffer> {
  const [assets, appleAuthToken, photo] = await Promise.all([
    loadPassAssets(resolved.design, resolved.cardId),
    ensureAppleAuthToken(serial),
    loadContactPhoto(resolved.cardId, resolved.photoAssetId),
  ])
  return buildBusinessApplePass({
    design: resolved.design,
    contact: resolved.contact,
    company: resolved.company,
    role,
    serial,
    scanUrl: scanUrlFor(resolved.scanCode),
    privacyUrl: privacyUrlFor(resolved.scanCode),
    assets: { icon: assets.icon, logo: assets.logo, photo },
    appleAuthToken,
  })
}

/** Der „Zu Google Wallet hinzufügen"-Link für einen ausgegebenen Pass. */
export function googleSaveUrlFor(
  resolved: ResolvedBusinessCard,
  serial: string,
  role: BusinessPassRole,
): string {
  return buildBusinessGoogleSaveUrl({
    cardId: resolved.cardId,
    design: resolved.design,
    contact: resolved.contact,
    company: resolved.company,
    role,
    serial,
    scanUrl: scanUrlFor(resolved.scanCode),
    privacyUrl: privacyUrlFor(resolved.scanCode),
    photoUrl: resolved.photoUrl,
  })
}

/**
 * Zählt einen Aufruf, einen Wallet-Pass oder einen gespeicherten Kontakt.
 *
 * Eine fehlende Zählung darf keinen Pass verhindern: der Fehler wird geloggt, nicht
 * weitergereicht.
 */
export async function recordBusinessCardEvent(
  contactId: string,
  kind: BusinessCardEventKind,
  platform: string | null,
): Promise<void> {
  try {
    await prisma.businessCardEvent.create({ data: { contactId, kind, platform } })
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[business-card] event not recorded', kind, error)
  }
}
