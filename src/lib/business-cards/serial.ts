import { randomBytes } from 'node:crypto'

/**
 * Seriennummern und Codes der Visitenkarte.
 *
 * Eigenes Präfix `V-` neben `K-` (Stempelkarte) und `G-` (Gutschein): Apple ruft Pässe nur
 * über ihre Seriennummer ab, und am Präfix entscheidet `rebuildIssuedPass`, welcher Bauweg
 * zuständig ist — ohne eine zusätzliche Datenbankabfrage für jeden Abruf.
 */

export const BUSINESS_SERIAL_PREFIX = 'V-'

export function newBusinessSerial(): string {
  return `${BUSINESS_SERIAL_PREFIX}${randomBytes(6).toString('hex').toUpperCase()}`
}

export function isBusinessSerial(serial: string): boolean {
  return serial.toUpperCase().startsWith(BUSINESS_SERIAL_PREFIX)
}

/** Code hinter `/v/<scanCode>`: 16 Zufallsbytes, kurz genug für einen QR, nicht zu erraten. */
export function newScanCode(): string {
  return randomBytes(16).toString('base64url')
}

/** Einmal-Link für den Aussteller-Pass. Länger, weil er einen Pass mit QR-Code freigibt. */
export function newOwnerClaimToken(): string {
  return randomBytes(32).toString('base64url')
}

/** Grobe Formprüfung, bevor ein Code die Datenbank erreicht. */
export function isPlausibleCode(code: string): boolean {
  return /^[A-Za-z0-9_-]{16,64}$/.test(code)
}
