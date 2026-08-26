import { afterEach, describe, expect, it, vi } from 'vitest'
import { geocodeAddress, GeocodeError } from '@/lib/geo/geocode'

/**
 * Die Adresssuche hinter dem Kundendialog.
 *
 * Sie ist die einzige Stelle im Projekt, die einen fremden Dienst fragt. Getestet wird
 * deshalb nicht Nominatim, sondern der Umgang mit dem, was zurückkommt: eine Antwort ist
 * fremde Eingabe, "nichts gefunden" ist kein Fehler, ein toter Dienst schon.
 */

const NOMINATIM = 'nominatim.openstreetmap.org'

function mockFetch(impl: (url: URL) => Response | Promise<Response>) {
  const spy = vi.fn((input: string | URL) => Promise.resolve(impl(new URL(String(input)))))
  vi.stubGlobal('fetch', spy)
  return spy
}

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })

const ADDRESS = { street: 'Hauptstraße 12', postalCode: '10115', city: 'Berlin' }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('geocodeAddress', () => {
  it('gibt den ersten Treffer als Zahlen zurück — Nominatim liefert Strings', async () => {
    mockFetch(() => json([{ lat: '52.5321', lon: '13.3849', display_name: 'Hauptstraße 12, Berlin' }]))

    const hit = await geocodeAddress(ADDRESS)

    expect(hit).toEqual({
      latitude: 52.5321,
      longitude: 13.3849,
      label: 'Hauptstraße 12, Berlin',
    })
  })

  it('stellt die Adresse strukturiert und begrenzt die Antwort auf einen Treffer', async () => {
    const spy = mockFetch(() => json([{ lat: '52.5', lon: '13.4' }]))

    await geocodeAddress(ADDRESS)

    const url = new URL(String(spy.mock.calls[0]![0]))
    expect(url.hostname).toBe(NOMINATIM)
    expect(url.searchParams.get('street')).toBe('Hauptstraße 12')
    expect(url.searchParams.get('postalcode')).toBe('10115')
    expect(url.searchParams.get('city')).toBe('Berlin')
    expect(url.searchParams.get('limit')).toBe('1')
  })

  it('schickt den von den Nutzungsregeln verlangten User-Agent mit', async () => {
    const spy = mockFetch(() => json([{ lat: '52.5', lon: '13.4' }]))

    await geocodeAddress(ADDRESS)

    const init = spy.mock.calls[0]![1] as { headers: Record<string, string> }
    expect(init.headers['User-Agent']).toMatch(/^Stampie\/1\.0 \(http/)
  })

  it('fragt gar nicht erst, wenn weder PLZ noch Ort dastehen', async () => {
    const spy = mockFetch(() => json([]))

    expect(await geocodeAddress({ street: 'Hauptstraße 12', postalCode: '', city: '' })).toBeNull()
    expect(spy).not.toHaveBeenCalled()
  })

  it('meldet "nichts gefunden" als null, nicht als Fehler', async () => {
    mockFetch(() => json([]))
    expect(await geocodeAddress(ADDRESS)).toBeNull()
  })

  it('unterscheidet einen toten Dienst von einer unbekannten Adresse', async () => {
    mockFetch(() => new Response('nope', { status: 503 }))
    await expect(geocodeAddress(ADDRESS)).rejects.toBeInstanceOf(GeocodeError)
  })

  it('nimmt keine Koordinaten an, die außerhalb des Wertebereichs liegen', async () => {
    mockFetch(() => json([{ lat: '999', lon: '13.4' }]))
    await expect(geocodeAddress(ADDRESS)).rejects.toBeInstanceOf(GeocodeError)
  })
})
