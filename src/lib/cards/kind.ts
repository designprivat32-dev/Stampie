import type { Prisma } from '@prisma/client'
import { CARD_KINDS, type CardKind } from './schema'

/**
 * Die Kartenarten, die Stempeln, Einlösen, Ausgabe über `/k`, Nachrichten und
 * Erinnerungen kennen — heute alle, die es gibt.
 *
 * Das ändert sich mit der Visitenkarte: sie kommt als weiterer Wert in das Prisma-Enum
 * `CardKind`, aber nicht in `CARD_KINDS`. Sehr viel Code unterscheidet nur „Gutschein
 * oder nicht" und würde eine Visitenkarte stillschweigend wie eine Stempelkarte behandeln.
 * Deshalb grenzen die Abfragen dieser Wege mit den Filtern hier ein, statt sich darauf zu
 * verlassen, dass eine fremde Art nie bei ihnen ankommt.
 *
 * Funktionen statt Konstanten: Prisma erwartet ein veränderbares Array, und ein geteiltes
 * Objekt, das irgendwo doch verändert wird, wäre ein schwer zu findender Fehler.
 */

export function isLoyaltyKind(kind: string): kind is CardKind {
  return (CARD_KINDS as readonly string[]).includes(kind)
}

/** `where`-Teil für `prisma.card`: nur Stempelkarten und Gutscheine. */
export function loyaltyCardWhere(): Prisma.CardWhereInput {
  return { kind: { in: [...CARD_KINDS] } }
}

/** `where`-Teil für `prisma.issuedPass`: nur Pässe von Stempelkarten und Gutscheinen. */
export function loyaltyPassWhere(): Prisma.IssuedPassWhereInput {
  return { card: loyaltyCardWhere() }
}
