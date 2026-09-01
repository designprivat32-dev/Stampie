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

/**
 * Die Einwilligung in die Wiedererkennung des Geräts.
 *
 * Eine andere Frage als die Werbe-Einwilligung, und rechtlich sogar eine andere Baustelle:
 * hier wird etwas *auf dem Gerät* abgelegt, und dafür verlangt § 25 TDDDG eine Zustimmung,
 * sobald es nicht zwingend für den gewünschten Dienst nötig ist. Eine Statistik ist das
 * nicht.
 *
 * Der Nutzen liegt trotzdem beim Kunden: ohne Wiedererkennung bekommt er beim zweiten
 * Scannen eine *neue, leere* Karte statt seiner alten — die Stempel liegen dann auf zwei
 * Karten. Deshalb steht dieser Nutzen im Text und nicht die Statistik.
 */
export const RECOGNITION_VERSION = 1

export const RECOGNITION_TEXT =
  'Diese Karte auf meinem Gerät wiedererkennen, damit ich beim erneuten Scannen meine bestehende Karte zurückbekomme statt einer neuen.'

export function recognitionRecord(now: Date = new Date()): {
  recognitionConsentAt: Date
  recognitionConsentText: string
} {
  return {
    recognitionConsentAt: now,
    recognitionConsentText: `v${RECOGNITION_VERSION}: ${RECOGNITION_TEXT}`,
  }
}

/** Der Parameter, unter dem die Ausgabeseite den wiedererkannten Schlüssel mitschickt. */
export const DEVICE_PARAM = 'd'

/**
 * Ein vom Browser erzeugter Schlüssel, der als Kennung taugt.
 *
 * Wer ihn kennt, bekommt diese Karte — deshalb muss er lang und zufällig sein. Zu kurze
 * oder fremdartige Werte werden verworfen, statt sie als Kennung zu übernehmen: ein
 * geratener Schlüssel darf niemandem die Karte eines anderen öffnen.
 */
export function isValidDeviceKey(value: string | null): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(value)
}
