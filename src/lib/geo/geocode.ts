import 'server-only'
import { z } from 'zod'
import { appUrl } from '@/lib/app-url'

/**
 * Adresse → Koordinaten, über Nominatim (OpenStreetMap).
 *
 * Warum überhaupt: die Standort-Benachrichtigung braucht Breiten- und Längengrad, und
 * niemand tippt die ab. Die Stammdaten haben die Adresse ohnehin schon.
 *
 * Warum Nominatim: kein Schlüssel, keine Kreditkarte, keine Vertragsbindung für eine
 * Abfrage, die pro Laden einmal im Leben passiert — und die Daten dürfen gespeichert
 * werden (ODbL), was bei Google Maps ausdrücklich nicht der Fall ist. Der Preis dafür sind
 * die Nutzungsregeln: aussagekräftiger User-Agent, und niemand flutet den Dienst. Die
 * Suche läuft nur auf Knopfdruck, höchstens drei Anfragen pro Klick.
 *
 * Warum serverseitig: Nominatim setzt keine CORS-Header für fremde Seiten, und der
 * User-Agent lässt sich im Browser nicht setzen.
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
/** Nominatim antwortet normalerweise in unter einer Sekunde; danach ist etwas kaputt. */
const TIMEOUT_MS = 8000
/** Mehr Vorschläge als das liest niemand durch. */
const MAX_CANDIDATES = 5

export interface GeocodeQuery {
  street: string
  postalCode: string
  city: string
}

export interface GeocodeCandidate {
  latitude: number
  longitude: number
  /** Die vollständige Adresse, wie Nominatim sie schreibt — zum Gegenlesen. */
  label: string
  /**
   * Die Adressteile aus der Antwort. Damit rückt die Auswahl eines Vorschlags auch das
   * Formular gerade: wer „Hauptstr. 12, 10115" eingetippt hat und den Treffer in 10827
   * anklickt, will nicht anschließend die PLZ selbst korrigieren.
   */
  street: string | null
  postalCode: string | null
  city: string | null
}

export interface GeocodeResult {
  candidates: GeocodeCandidate[]
  /**
   * True nur, wenn die eingetippte Adresse genau so gefunden wurde. Sonst sind die
   * Kandidaten Vorschläge, die jemand ansehen und bestätigen muss.
   */
  exact: boolean
}

/**
 * Die Antwort ist fremde Eingabe wie jede andere: erst geprüft, dann benutzt. `lat`/`lon`
 * kommen als Strings, deshalb `z.coerce`.
 */
const responseSchema = z.array(
  z.object({
    lat: z.coerce.number().min(-90).max(90),
    lon: z.coerce.number().min(-180).max(180),
    display_name: z.string().max(500).optional(),
    address: z
      .object({
        road: z.string().max(160).optional(),
        house_number: z.string().max(20).optional(),
        postcode: z.string().max(20).optional(),
        city: z.string().max(120).optional(),
        town: z.string().max(120).optional(),
        village: z.string().max(120).optional(),
        municipality: z.string().max(120).optional(),
      })
      .optional(),
  }),
)

export class GeocodeError extends Error {}

/**
 * Sucht die Adresse in drei Stufen und gibt zurück, was dabei herauskommt.
 *
 * 1. Genau so, wie eingetippt (Straße + PLZ + Ort). Trifft das, ist die Sache erledigt.
 * 2. Ohne PLZ, als Freitext. Die PLZ ist der häufigste Grund für null Treffer — sie muss
 *    in OSM exakt am Haus hängen. Ohne sie findet Nominatim sogar „Hauptstr. 12" und
 *    liefert die richtige PLZ gleich mit.
 * 3. Nur PLZ und Ort. Ein Ortsmittelpunkt ist als Standort schlecht, aber als Vorschlag,
 *    den jemand bewusst anklickt, immer noch besser als eine Sackgasse.
 *
 * Wirft `GeocodeError`, wenn der Dienst nicht erreichbar ist — das ist etwas anderes als
 * „Adresse unbekannt" und muss dem Nutzer auch anders gesagt werden.
 */
export async function geocodeAddress(query: GeocodeQuery): Promise<GeocodeResult> {
  const street = query.street.trim()
  const postalCode = query.postalCode.trim()
  const city = query.city.trim()

  // Ohne Ort oder PLZ ist eine Hausnummer wertlos — die gibt es in jeder zweiten Stadt.
  if (city.length === 0 && postalCode.length === 0) return { candidates: [], exact: false }

  if (street.length > 0) {
    const exact = await search({ street, postalcode: postalCode, city, limit: '1' })
    if (exact.length > 0) return { candidates: exact.slice(0, 1), exact: true }

    const place = city || postalCode
    const suggestions = await search({ q: `${street} ${place}`, limit: String(MAX_CANDIDATES) })
    if (suggestions.length > 0) return { candidates: suggestions, exact: false }
  }

  const area = await search({ q: [postalCode, city].filter(Boolean).join(' '), limit: '1' })
  return { candidates: area, exact: false }
}

async function search(params: Record<string, string>): Promise<GeocodeCandidate[]> {
  const url = new URL(NOMINATIM_URL)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('addressdetails', '1')
  for (const [key, value] of Object.entries(params)) {
    if (value.length > 0) url.searchParams.set(key, value)
  }

  let response: Response
  try {
    response = await fetch(url, {
      headers: {
        // Von den Nutzungsregeln verlangt: wer fragt, und wo man sich beschweren kann.
        'User-Agent': `Stampie/1.0 (${appUrl()})`,
        'Accept-Language': 'de',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    })
  } catch (error) {
    throw new GeocodeError(messageOf(error))
  }

  if (!response.ok) throw new GeocodeError(`HTTP ${response.status}`)

  const parsed = responseSchema.safeParse(await response.json().catch(() => null))
  if (!parsed.success) throw new GeocodeError('Unerwartete Antwort des Suchdienstes.')

  return parsed.data.slice(0, MAX_CANDIDATES).map((hit) => {
    const address = hit.address
    const road = address?.road?.trim()
    const houseNumber = address?.house_number?.trim()

    return {
      latitude: hit.lat,
      longitude: hit.lon,
      label: hit.display_name ?? [road, houseNumber].filter(Boolean).join(' '),
      street: road ? [road, houseNumber].filter(Boolean).join(' ') : null,
      postalCode: address?.postcode?.trim() ?? null,
      city: address?.city ?? address?.town ?? address?.village ?? address?.municipality ?? null,
    }
  })
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Unbekannter Fehler'
}
