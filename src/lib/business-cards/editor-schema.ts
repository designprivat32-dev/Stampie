import { z } from 'zod'
import { hexColorSchema } from '@/lib/cards/schema'
import { businessCompanySchema, businessContactSchema } from './schema'

/**
 * Alles, was der Visitenkarten-Editor mit einem Klick auf „Speichern" schickt.
 *
 * Ein Schema für den ganzen Stand statt eines je Abschnitt: der Editor hat einen einzigen
 * Speichern-Knopf, und Fehler kommen mit Pfaden zurück (`contacts.2.email`), die das
 * Formular direkt dem richtigen Feld zuordnet. Ohne Server-Abhängigkeiten, damit der
 * Client dieselben Typen benutzt.
 */

export const MAX_CONTACTS = 200

export const editorDesignSchema = z.object({
  backgroundColor: hexColorSchema,
  foregroundColor: hexColorSchema,
  labelColor: hexColorSchema,
  cardTitle: z.string().trim().max(40, 'Höchstens 40 Zeichen.'),
  logoAssetId: z.string().cuid().nullable(),
})
export type EditorDesign = z.infer<typeof editorDesignSchema>

export const editorContactSchema = businessContactSchema.extend({
  /** Null bei einer Person, die erst mit diesem Speichern angelegt wird. */
  id: z.string().cuid().nullable(),
  /** Stabiler Schlüssel aus dem Client, um neue Personen ihrer neuen Id zuzuordnen. */
  key: z.string().min(1).max(64),
  photoAssetId: z.string().cuid().nullable().default(null),
})
export type EditorContactInput = z.input<typeof editorContactSchema>

export const editorSaveSchema = z.object({
  cardId: z.string().cuid(),
  design: editorDesignSchema,
  /** Null, solange keine Firmendaten eingetragen sind. */
  company: businessCompanySchema.nullable(),
  contacts: z.array(editorContactSchema).max(MAX_CONTACTS, `Höchstens ${MAX_CONTACTS} Personen.`),
  /** Personen, die im Editor entfernt wurden — gelöscht wird erst beim Speichern. */
  deletedContactIds: z.array(z.string().cuid()).max(MAX_CONTACTS).default([]),
})
export type EditorSaveInput = z.input<typeof editorSaveSchema>
export type EditorSave = z.output<typeof editorSaveSchema>

export interface EditorSaveResult {
  /** Veröffentlichte Version, falls sich das Aussehen geändert hat; sonst die bisherige. */
  version: number | null
  /** Client-Schlüssel -> neue Id der Personen, die gerade angelegt wurden. */
  createdContactIds: Record<string, string>
  /** Was sich geändert hat — für die Meldung nach dem Speichern. */
  changed: { design: boolean; company: boolean; contacts: number; deleted: number }
}
