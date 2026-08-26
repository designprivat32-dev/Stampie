import { afterEach, describe, expect, it, vi } from 'vitest'
import { geocodeAddress, GeocodeError } from '@/lib/geo/geocode'

/**
 * Die Adresssuche hinter dem Kundendialog.
 *
 * Sie ist die einzige Stelle im Projekt, die einen fremden Dienst fragt. Getestet wird
 * deshalb nicht Nominatim, sondern der Umgang mit dem, was zurückkommt: eine Antwort ist
 * fremde Eingabe, "nichts genau gefunden" muss zu Vorschlägen führen statt zu einer
 * Sackgasse, und ein toter Dienst ist etwas anderes als eine unbekannte Adresse.
 */

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })

/** Antwortet je nach Suchstufe: strukturiert (mit `street`) oder Freitext (mit `q`). */
function mockFetch(byStage: { structured?: unknown[]; freeText?: unknown[]; area?: unknown[] }) {
  const calls: URL[] = []
  const spy = vi.fn((input: string | URL, init?: RequestInit) => {
    void init
    const url = new URL(String(input))
    calls.push(url)
    if (url.searchParams.has('street')) return Promise.resolve(json(byStage.structured ?? []))
    const q = url.searchParams.get('q') ?? ''
    // Die dritte Stufe fragt nur noch PLZ und Ort, ohne Straßennamen.
    const isArea = !q.toLowerCase().includes('hauptstr')
    return Promise.resolve(json((isArea ? byStage.area : byStage.freeText) ?? []))
  })
  vi.stubGlobal('fetch', spy)
  return { spy, calls }
}

const ADDRESS = { street: 'Hauptstraße 12', postalCode: '10115', city: 'Berlin' }

const HIT = {
  lat: '52.5321',
  lon: '13.3849',
  display_name: 'Hauptstraße 12, Schöneberg, Berlin, 10827, Deutschland',
  address: { road: 'Hauptstraße', house_number: '12', postcode: '10827', city: 'Berlin' },
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('geocodeAddress', () => {
  it('meldet den strukturierten Treffer als exakt und fragt nicht weiter', async () => {
    const { calls } = mockFetch({ structured: [HIT] })

    const result = await geocodeAddress(ADDRESS)

    expect(result.exact).toBe(true)
    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0]).toMatchObject({
      latitude: 52.5321,
      longitude: 13.3849,
      street: 'Hauptstraße 12',
      postalCode: '10827',
      city: 'Berlin',
    })
    expect(calls).toHaveLength(1)
  })

  it('sucht ohne PLZ weiter, wenn die Adresse so nicht existiert, und liefert Vorschläge', async () => {
    const { calls } = mockFetch({ structured: [], freeText: [HIT, { ...HIT, lat: '52.4' }] })

    const result = await geocodeAddress(ADDRESS)

    expect(result.exact).toBe(false)
    expect(result.candidates).toHaveLength(2)
    // Die PLZ ist der häufigste Grund für null Treffer — genau sie fällt in Stufe 2 weg.
    const fallback = calls[1]!
    expect(fallback.searchParams.get('q')).toBe('Hauptstraße 12 Berlin')
    expect(fallback.searchParams.has('postalcode')).toBe(false)
  })

  it('bietet zuletzt den Ort an, statt in einer Sackgasse zu enden', async () => {
    const { calls } = mockFetch({
      structured: [],
      freeText: [],
      area: [{ lat: '52.53', lon: '13.38', display_name: '10115, Mitte, Berlin, Deutschland' }],
    })

    const result = await geocodeAddress(ADDRESS)

    expect(result.exact).toBe(false)
    expect(result.candidates[0]!.label).toContain('Mitte')
    expect(calls[2]!.searchParams.get('q')).toBe('10115 Berlin')
  })

  it('gibt höchstens fünf Vorschläge zurück', async () => {
    mockFetch({ structured: [], freeText: Array.from({ length: 9 }, () => HIT) })
    expect((await geocodeAddress(ADDRESS)).candidates).toHaveLength(5)
  })

  it('schickt den von den Nutzungsregeln verlangten User-Agent mit', async () => {
    const spy = vi.fn((_input: string | URL, init?: RequestInit) => {
      void _input
      void init
      return Promise.resolve(json([HIT]))
    })
    vi.stubGlobal('fetch', spy)

    await geocodeAddress(ADDRESS)

    const init = spy.mock.calls[0]![1] as { headers: Record<string, string> }
    expect(init.headers['User-Agent']).toMatch(/^Stampie\/1\.0 \(http/)
  })

  it('fragt gar nicht erst, wenn weder PLZ noch Ort dastehen', async () => {
    const { spy } = mockFetch({ structured: [HIT] })

    const result = await geocodeAddress({ street: 'Hauptstraße 12', postalCode: '', city: '' })

    expect(result.candidates).toHaveLength(0)
    expect(spy).not.toHaveBeenCalled()
  })

  it('unterscheidet einen toten Dienst von einer unbekannten Adresse', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('nope', { status: 503 }))))
    await expect(geocodeAddress(ADDRESS)).rejects.toBeInstanceOf(GeocodeError)
  })

  it('nimmt keine Koordinaten an, die außerhalb des Wertebereichs liegen', async () => {
    mockFetch({ structured: [{ ...HIT, lat: '999' }] })
    await expect(geocodeAddress(ADDRESS)).rejects.toBeInstanceOf(GeocodeError)
  })
})
