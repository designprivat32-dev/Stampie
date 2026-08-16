import { beforeEach, describe, expect, it, vi } from 'vitest'

const findMany = vi.fn()
const updateMany = vi.fn()
const findFirst = vi.fn()
const deleteRegistration = vi.fn()
const readAppleWalletCredentials = vi.fn()
const sendPassUpdatePush = vi.fn()

vi.mock('@/lib/db', () => ({
  prisma: {
    issuedPass: {
      findMany: (...a: unknown[]) => findMany(...a),
      updateMany: (...a: unknown[]) => updateMany(...a),
      findFirst: (...a: unknown[]) => findFirst(...a),
    },
    appleDeviceRegistration: { delete: (...a: unknown[]) => deleteRegistration(...a) },
  },
}))
vi.mock('@/lib/pass/apple-pass-builder', () => ({
  readAppleWalletCredentials: () => readAppleWalletCredentials(),
}))
vi.mock('@/lib/pass/apple-apns', () => ({
  sendPassUpdatePush: (...a: unknown[]) => sendPassUpdatePush(...a),
}))

const { pushAppleWalletUpdate, pushAppleWalletUpdateForCard } = await import(
  '@/lib/wallet/apple-sync'
)

const CREDENTIALS = {
  passTypeIdentifier: 'pass.de.stampie.test',
  teamIdentifier: 'A1B2C3D4E5',
  certificatePem: 'cert',
  privateKeyPem: 'key',
  chainPem: [],
}

beforeEach(() => {
  findMany.mockReset()
  updateMany.mockReset().mockResolvedValue({ count: 0 })
  findFirst.mockReset()
  deleteRegistration.mockReset()
  sendPassUpdatePush.mockReset()
  readAppleWalletCredentials.mockReset().mockReturnValue(CREDENTIALS)
})

/**
 * Publishing a new design is the second event that makes an installed pass stale. Apple has
 * no class to patch, so every phone has to be knocked on individually — and a mistake here
 * is silent: the shop sees a successful publish and the customer's card never changes.
 */
describe('pushAppleWalletUpdateForCard', () => {
  it('pushes to every pass of the card', async () => {
    findMany.mockResolvedValue([{ serial: 'K-1' }, { serial: 'K-2' }])
    findFirst.mockResolvedValue({ id: 'p1', appleRegistrations: [{ id: 'r1', pushToken: 't1' }] })
    sendPassUpdatePush.mockResolvedValue({ ok: true })

    const summary = await pushAppleWalletUpdateForCard('card-1')

    expect(summary).toEqual({ passes: 2, devices: 2, failed: 0 })
    expect(sendPassUpdatePush).toHaveBeenCalledTimes(2)
  })

  it('marks the passes as changed, or the device finds nothing and calls it spurious', async () => {
    findMany.mockResolvedValue([{ serial: 'K-1' }])
    findFirst.mockResolvedValue({ id: 'p1', appleRegistrations: [{ id: 'r1', pushToken: 't1' }] })
    sendPassUpdatePush.mockResolvedValue({ ok: true })

    await pushAppleWalletUpdateForCard('card-1')

    // Publishing writes a CardDesign row; the pass rows are untouched. The device answers
    // a push by asking which of its passes changed since a tag, and that is read from
    // IssuedPass.updatedAt — so the push alone reaches nobody.
    expect(updateMany).toHaveBeenCalledTimes(1)
    const call = updateMany.mock.calls[0]?.[0]
    expect(call.where).toMatchObject({ cardId: 'card-1', appleRegistrations: { some: {} } })
    expect(call.data.updatedAt).toBeInstanceOf(Date)
  })

  it('marks them before knocking, never after', async () => {
    const order: string[] = []
    findMany.mockResolvedValue([{ serial: 'K-1' }])
    findFirst.mockResolvedValue({ id: 'p1', appleRegistrations: [{ id: 'r1', pushToken: 't1' }] })
    updateMany.mockImplementation(async () => {
      order.push('mark')
      return { count: 1 }
    })
    sendPassUpdatePush.mockImplementation(async () => {
      order.push('push')
      return { ok: true }
    })

    await pushAppleWalletUpdateForCard('card-1')

    // A device can come back within milliseconds. Marking afterwards would race it.
    expect(order).toEqual(['mark', 'push'])
  })

  it('only looks at passes an iPhone actually registered for', async () => {
    findMany.mockResolvedValue([])

    expect(await pushAppleWalletUpdateForCard('card-1')).toEqual({
      passes: 0,
      devices: 0,
      failed: 0,
    })
    expect(findMany.mock.calls[0]?.[0].where).toMatchObject({
      cardId: 'card-1',
      appleRegistrations: { some: {} },
    })
  })

  it('does nothing at all without a certificate, and asks the database for nothing', async () => {
    readAppleWalletCredentials.mockReturnValue(null)

    expect(await pushAppleWalletUpdateForCard('card-1')).toEqual({
      passes: 0,
      devices: 0,
      failed: 0,
    })
    expect(findMany).not.toHaveBeenCalled()
  })

  it('counts a failed pass without letting it stop the rest', async () => {
    findMany.mockResolvedValue([{ serial: 'K-1' }, { serial: 'K-2' }, { serial: 'K-3' }])
    findFirst.mockResolvedValue({ id: 'p1', appleRegistrations: [{ id: 'r1', pushToken: 't1' }] })
    sendPassUpdatePush
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new Error('APNs weg'))
      .mockResolvedValueOnce({ ok: true })

    const summary = await pushAppleWalletUpdateForCard('card-1')

    expect(summary.passes).toBe(2)
    expect(summary.failed).toBe(1)
    expect(sendPassUpdatePush).toHaveBeenCalledTimes(3)
  })

  it('counts devices, not passes, when one card sits on several phones', async () => {
    findMany.mockResolvedValue([{ serial: 'K-1' }])
    findFirst.mockResolvedValue({
      id: 'p1',
      appleRegistrations: [
        { id: 'r1', pushToken: 't1' },
        { id: 'r2', pushToken: 't2' },
      ],
    })
    sendPassUpdatePush.mockResolvedValue({ ok: true })

    expect(await pushAppleWalletUpdateForCard('card-1')).toEqual({
      passes: 1,
      devices: 2,
      failed: 0,
    })
  })
})

describe('pushAppleWalletUpdate', () => {
  it('forgets a device that reports the pass as gone', async () => {
    findFirst.mockResolvedValue({ id: 'p1', appleRegistrations: [{ id: 'r1', pushToken: 't1' }] })
    sendPassUpdatePush.mockResolvedValue({ ok: false, deviceGone: true })

    const result = await pushAppleWalletUpdate('K-1')

    // Keeping the row would mean pushing into the void on every future stamp, forever.
    expect(deleteRegistration).toHaveBeenCalledWith({ where: { id: 'r1' } })
    expect(result.status).toBe('no_devices')
  })

  it('keeps the registration when the push merely failed', async () => {
    findFirst.mockResolvedValue({ id: 'p1', appleRegistrations: [{ id: 'r1', pushToken: 't1' }] })
    sendPassUpdatePush.mockResolvedValue({
      ok: false,
      deviceGone: false,
      status: 429,
      reason: 'TooManyRequests',
    })

    await pushAppleWalletUpdate('K-1')

    expect(deleteRegistration).not.toHaveBeenCalled()
  })

  it('reports a pass nobody installed as no_devices, not as an error', async () => {
    findFirst.mockResolvedValue({ id: 'p1', appleRegistrations: [] })

    expect((await pushAppleWalletUpdate('K-1')).status).toBe('no_devices')
    expect(sendPassUpdatePush).not.toHaveBeenCalled()
  })
})
