import type { BusinessEditorData } from '@/lib/business-cards/editor-service'
import type { EditorSaveInput } from '@/lib/business-cards/editor-schema'

/**
 * Der Stand, den der Visitenkarten-Editor im Browser hält — alles als Text, so wie es in den
 * Feldern steht. Erst beim Speichern wird daraus die Eingabe für den Server.
 */

export interface DraftDesign {
  backgroundColor: string
  foregroundColor: string
  labelColor: string
  cardTitle: string
  logoAssetId: string | null
  logoUrl: string | null
}

export interface DraftCompany {
  company: string
  website: string
  phone: string
  street: string
  postalCode: string
  city: string
}

export interface DraftLink {
  label: string
  url: string
}

export interface DraftContact {
  /** Stabil über das Speichern hinweg; bei gespeicherten Personen die Id. */
  key: string
  id: string | null
  firstName: string
  lastName: string
  jobTitle: string
  phone: string
  mobile: string
  email: string
  links: DraftLink[]
  photoAssetId: string | null
  photoUrl: string | null
}

export interface EditorDraft {
  design: DraftDesign
  company: DraftCompany
  contacts: DraftContact[]
  deletedContactIds: string[]
}

export function draftFromData(data: BusinessEditorData): EditorDraft {
  const c = data.company
  return {
    design: { ...data.design },
    company: {
      company: c?.company ?? '',
      website: c?.website ?? '',
      phone: c?.phone ?? '',
      street: c?.street ?? '',
      postalCode: c?.postalCode ?? '',
      city: c?.city ?? '',
    },
    contacts: data.contacts.map((entry) => ({
      key: entry.id,
      id: entry.id,
      firstName: entry.contact.firstName,
      lastName: entry.contact.lastName,
      jobTitle: entry.contact.jobTitle ?? '',
      phone: entry.contact.phone ?? '',
      mobile: entry.contact.mobile ?? '',
      email: entry.contact.email ?? '',
      links: entry.contact.links.map((l) => ({ ...l })),
      photoAssetId: entry.photoAssetId,
      photoUrl: entry.photoUrl,
    })),
    deletedContactIds: [],
  }
}

export function emptyContact(key: string): DraftContact {
  return {
    key,
    id: null,
    firstName: '',
    lastName: '',
    jobTitle: '',
    phone: '',
    mobile: '',
    email: '',
    links: [],
    photoAssetId: null,
    photoUrl: null,
  }
}

function companyIsEmpty(company: DraftCompany): boolean {
  return Object.values(company).every((v) => v.trim() === '')
}

export function toSaveInput(cardId: string, draft: EditorDraft): EditorSaveInput {
  return {
    cardId,
    design: {
      backgroundColor: draft.design.backgroundColor,
      foregroundColor: draft.design.foregroundColor,
      labelColor: draft.design.labelColor,
      cardTitle: draft.design.cardTitle,
      logoAssetId: draft.design.logoAssetId,
    },
    company: companyIsEmpty(draft.company) ? null : draft.company,
    contacts: draft.contacts.map((c) => ({
      id: c.id,
      key: c.key,
      firstName: c.firstName,
      lastName: c.lastName,
      jobTitle: c.jobTitle,
      phone: c.phone,
      mobile: c.mobile,
      email: c.email,
      links: c.links,
      photoAssetId: c.photoAssetId,
    })),
    deletedContactIds: draft.deletedContactIds,
  }
}

/** Gleich, wenn sich am gespeicherten Stand nichts ändern würde. */
export function sameDraft(a: EditorDraft, b: EditorDraft): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Fertige Farbkombinationen — gut lesbar, damit niemand mit drei Farbwählern anfangen muss. */
export const COLOR_PRESETS: ReadonlyArray<{ name: string; bg: string; fg: string; label: string }> = [
  { name: 'Nachtblau', bg: '#1f3a5f', fg: '#ffffff', label: '#b9cbe3' },
  { name: 'Graphit', bg: '#26282c', fg: '#ffffff', label: '#a7abb3' },
  { name: 'Tanne', bg: '#1f4d3a', fg: '#ffffff', label: '#b5d6c5' },
  { name: 'Bordeaux', bg: '#5c1f2e', fg: '#ffffff', label: '#e2b8c2' },
  { name: 'Sand', bg: '#efe6d8', fg: '#2b2620', label: '#8a7a64' },
  { name: 'Weiß', bg: '#ffffff', fg: '#1a1a1a', label: '#6b7280' },
]
