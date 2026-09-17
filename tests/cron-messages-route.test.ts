import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetRateLimits } from '@/lib/rate-limit'

// The three jobs need a database; here we only care about who gets past the door.
const { deliverDueMessages, deliverDueReminders, runRetention } = vi.hoisted(() => ({
  deliverDueMessages: vi.fn(async () => ({ delivered: 0, failed: 0 })),
  deliverDueReminders: vi.fn(async () => ({ delivered: 0 })),
  runRetention: vi.fn(async () => ({ deleted: 0 })),
}))
vi.mock('@/lib/cards/message-service', () => ({ deliverDueMessages }))
vi.mock('@/lib/cards/reminder-service', () => ({ deliverDueReminders }))
vi.mock('@/lib/privacy/retention', () => ({ runRetention }))

import { GET } from '@/app/api/cron/messages/route'

function call(secret: string | null): Promise<Response> {
  const headers = new Headers()
  if (secret !== null) headers.set('authorization', `Bearer ${secret}`)
  return GET(new Request('https://karte.stampie.de/api/cron/messages', { headers }) as never)
}

describe('GET /api/cron/messages', () => {
  beforeEach(() => {
    resetRateLimits()
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'richtig'
  })

  it('refuses without a configured secret and touches nothing', async () => {
    delete process.env.CRON_SECRET
    const res = await call('irgendwas')
    expect(res.status).toBe(503)
    expect(deliverDueMessages).not.toHaveBeenCalled()
  })

  it('refuses a wrong secret before any job runs', async () => {
    const res = await call('falsch')
    expect(res.status).toBe(401)
    expect(deliverDueMessages).not.toHaveBeenCalled()
    expect(runRetention).not.toHaveBeenCalled()
  })

  it('runs all three jobs with the right secret', async () => {
    const res = await call('richtig')
    expect(res.status).toBe(200)
    expect(deliverDueMessages).toHaveBeenCalledTimes(1)
    expect(deliverDueReminders).toHaveBeenCalledTimes(1)
    expect(runRetention).toHaveBeenCalledTimes(1)
  })

  it('allows only one run per ten minutes, even with the right secret', async () => {
    expect((await call('richtig')).status).toBe(200)
    const second = await call('richtig')
    expect(second.status).toBe(429)
    // The refused call must not have woken the database.
    expect(deliverDueMessages).toHaveBeenCalledTimes(1)
    expect(runRetention).toHaveBeenCalledTimes(1)
  })

  it('does not let a wrong secret use up the window', async () => {
    expect((await call('falsch')).status).toBe(401)
    expect((await call('richtig')).status).toBe(200)
  })
})
