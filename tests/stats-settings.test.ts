import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Die Inaktiv-Schwelle speichern.
 *
 * Der Regler in der App war da, der Endpunkt nicht — sie zeigte „Server-Teil folgt noch".
 * Wichtig ist hier vor allem, dass die Organisation aus dem Token kommt und nicht aus dem
 * Rumpf: sonst könnte ein Betrieb die Einstellung eines anderen ändern.
 */

const orgUpdate = vi.fn()
vi.mock('@/lib/db', () => ({
  prisma: { organization: { update: (...a: unknown[]) => orgUpdate(...a) } },
}))

const requireAppUser = vi.fn()
vi.mock('@/lib/auth/app-session', () => ({
  requireAppUser: (...a: unknown[]) => requireAppUser(...a),
}))

const { POST } = await import('@/app/api/app/stats/settings/route')

const post = (body: unknown) =>
  new Request('https://karte.stampie.de/api/app/stats/settings', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
    body: JSON.stringify(body),
  })

beforeEach(() => {
  vi.clearAllMocks()
  requireAppUser.mockResolvedValue({ userId: 'u1', orgId: 'org-1', role: 'OWNER' })
  orgUpdate.mockImplementation(async ({ data }: { data: { inaktivNachMonaten: number } }) => ({
    inaktivNachMonaten: data.inaktivNachMonaten,
  }))
})

describe('POST /api/app/stats/settings', () => {
  it('speichert den Wert für die eigene Organisation', async () => {
    const res = await POST(post({ inaktivNachMonaten: 4 }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true, inaktivNachMonaten: 4 })
    expect(orgUpdate).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: { inaktivNachMonaten: 4 },
      select: { inaktivNachMonaten: true },
    })
  })

  it('nimmt die Organisation aus dem Token, nicht aus dem Rumpf', async () => {
    await POST(post({ inaktivNachMonaten: 4, orgId: 'fremder-betrieb' }))

    expect(orgUpdate.mock.calls[0]![0].where).toEqual({ id: 'org-1' })
  })

  it('weist Werte ausserhalb der Spanne ab', async () => {
    for (const wert of [0, -1, 61, 1.5]) {
      const res = await POST(post({ inaktivNachMonaten: wert }))
      expect(res.status).toBe(400)
    }
    expect(orgUpdate).not.toHaveBeenCalled()
  })

  it('weist einen fehlenden oder falsch getippten Wert ab', async () => {
    expect((await POST(post({}))).status).toBe(400)
    expect((await POST(post({ inaktivNachMonaten: '4' }))).status).toBe(400)
    expect(orgUpdate).not.toHaveBeenCalled()
  })

  it('verlangt eine Anmeldung', async () => {
    requireAppUser.mockResolvedValue(null)

    expect((await POST(post({ inaktivNachMonaten: 4 }))).status).toBe(401)
    expect(orgUpdate).not.toHaveBeenCalled()
  })

  it('laesst Agentur-Konten die Einstellung des Betriebs nicht aendern', async () => {
    requireAppUser.mockResolvedValue({ userId: 'u1', orgId: 'org-1', role: 'AGENCY' })

    expect((await POST(post({ inaktivNachMonaten: 4 }))).status).toBe(403)
    expect(orgUpdate).not.toHaveBeenCalled()
  })
})
