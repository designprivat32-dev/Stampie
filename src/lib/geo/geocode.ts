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
 * Abfrage, die pro Kunde einmal im Leben passiert. Der Preis dafür sind die
 * Nutzungsregeln — ein aussagekräftiger User-Agent ist Pflicht, und wer den Dienst mit
 * Anfragen flutet, wird gesperrt. Beides ist hier kein Thema: die Abfrage läuft nur auf
 * Knopfdruck im Kundendialog, nie automatisch und nie in einer Schleife.
 *
 * Warum serverseitig: Nominatim setzt keine CORS-Header für fremde Seiten, und der
 * User-Agent lässt sich im Browser nicht setzen. Vom Server aus ist beides erledigt.
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
/** Nominatim antwortet normalerweise in unter einer Sekunde; danach ist etwas kaputt. */
const TIMEOUT_MS = 8000

export interface GeocodeQuery {
  street: string
  postalCode: string
  city: string
}

export interface GeocodeHit {
  latitude: number
  longitude: number
  /** Die Adresse, wie Nominatim sie gefunden hat — zum Gegenlesen vor dem Speichern. */
  label: string
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
  }),
)

export class GeocodeError extends Error {}

/**
 * Sucht die Adresse und gibt den besten Treffer zurück, oder null, wenn es keinen gibt.
 *
 * Wirft `GeocodeError`, wenn der Dienst selbst nicht erreichbar ist — das ist etwas
 * anderes als "Adresse unbekannt" und muss dem Nutzer auch anders gesagt werden.
 */
export async function geocodeAddress(query: GeocodeQuery): Promise<GeocodeHit | null> {
  const street = query.street.trim()
  const postalCode = query.postalCode.trim()
  const city = query.city.trim()

  // Ohne Ort oder PLZ ist eine Hausnummer wertlos — die gibt es in jeder zweiten Stadt.
  if (city.length === 0 && postalCode.length === 0) return null

  const url = new URL(NOMINATIM_URL)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('limit', '1')
  url.searchParams.set('addressdetails', '0')
  if (street) url.searchParams.set('street', street)
  if (postalCode) url.searchParams.set('postalcode', postalCode)
  if (city) url.searchParams.set('city', city)

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

  if (!response.ok) {
    throw new GeocodeError(`HTTP ${response.status}`)
  }

  const parsed = responseSchema.safeParse(await response.json().catch(() => null))
  if (!parsed.success) throw new GeocodeError('Unerwartete Antwort des Suchdienstes.')

  const hit = parsed.data[0]
  if (!hit) return null

  return {
    latitude: hit.lat,
    longitude: hit.lon,
    label: hit.display_name ?? [street, postalCode, city].filter(Boolean).join(', '),
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Unbekannter Fehler'
}
