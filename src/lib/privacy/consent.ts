/**
 * Die Einwilligung in Werbenachrichten.
 *
 * Zwei Arten von Meldung erreichen einen Wallet-Pass, und nur eine davon braucht das hier.
 * Ändert sich der Stempelstand von 7 auf 8, ist das die Leistung, für die der Kunde die
 * Karte geholt hat. „Dir fehlen noch drei Stempel, komm vorbei" ist Werbung — dafür reicht
 * kein berechtigtes Interesse, und die Bestandskunden-Ausnahme des UWG greift nicht, weil
 * zu keiner Karte eine E-Mail-Adresse erhoben wird.
 *
 * Bleibt die Einwilligung, und die muss nachweisbar sein: gespeichert wird nicht nur ein
 * Häkchen, sondern der Wortlaut, dem zugestimmt wurde. Ändert sich der Text, ändert sich
 * die Fassung — sonst lässt sich später nicht mehr sagen, wozu jemand Ja gesagt hat.
 *
 * Pur und ohne Datenbank, damit der Wortlaut an genau einer Stelle steht: auf der
 * Ausgabeseite, im gespeicherten Nachweis und in der Auskunft.
 */

/** Hochzählen, sobald sich CONSENT_TEXT inhaltlich ändert. */
export const CONSENT_VERSION = 1

export const CONSENT_TEXT =
  'Ich möchte Nachrichten zu Angeboten und Erinnerungen dieses Betriebs auf meiner Karte erhalten. Das kann ich jederzeit widerrufen.'

/** Was als Nachweis am Pass landet. */
export function consentRecord(now: Date = new Date()): {
  marketingConsentAt: Date
  marketingConsentText: string
} {
  return {
    marketingConsentAt: now,
    marketingConsentText: `v${CONSENT_VERSION}: ${CONSENT_TEXT}`,
  }
}

/**
 * Der Parameter, mit dem die Ausgabeseite die Zustimmung an den Ausgabe-Endpunkt
 * weitergibt. Nur der exakte Wert zählt: alles andere ist keine Einwilligung.
 */
export const CONSENT_PARAM = 'c'

export function hasConsentParam(value: string | null): boolean {
  return value === '1'
}
