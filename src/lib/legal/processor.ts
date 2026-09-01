/**
 * Wer die Karten im Auftrag der Betriebe betreibt.
 *
 * Steht in der Datenschutzinformation, die jeder Endkunde beim Scannen erreicht: der
 * Betrieb ist Verantwortlicher, dieses Unternehmen ist sein Auftragsverarbeiter. Beides
 * muss dort mit Namen und Anschrift stehen, sonst erfüllt der Hinweis Art. 13 nicht.
 *
 * Aus der Umgebung statt fest im Code, weil es sich mit der Firmierung ändern kann, ohne
 * dass jemand ein Deployment dafür anfassen sollte. Pur und ohne Datenbank, damit die
 * Vollständigkeitsprüfung testbar bleibt.
 */

export interface Processor {
  name: string
  address: string
  email: string
}

export interface ProcessorState {
  processor: Processor | null
  /** Namen der fehlenden Variablen — die Seite benennt sie, statt Lücken zu zeigen. */
  missing: string[]
}

const FIELDS = {
  name: 'PROCESSOR_NAME',
  address: 'PROCESSOR_ADDRESS',
  email: 'PROCESSOR_EMAIL',
} as const

/** Nimmt eine lose Umgebung entgegen, damit Tests nicht das ganze ProcessEnv nachbauen. */
export function readProcessor(
  env: Record<string, string | undefined> = process.env,
): ProcessorState {
  const values = {
    name: env[FIELDS.name]?.trim() ?? '',
    address: env[FIELDS.address]?.trim() ?? '',
    email: env[FIELDS.email]?.trim() ?? '',
  }

  const missing = (Object.keys(FIELDS) as (keyof typeof FIELDS)[])
    .filter((k) => values[k].length === 0)
    .map((k) => FIELDS[k])

  return missing.length > 0 ? { processor: null, missing } : { processor: values, missing: [] }
}
