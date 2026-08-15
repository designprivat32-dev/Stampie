import 'server-only'
import http2 from 'node:http2'

/**
 * The raw APNs HTTP/2 call that wakes an installed Wallet pass.
 *
 * A pass-update push carries no payload worth reading — Wallet's reaction to receiving one
 * at all is to go ask the web service what changed, via the registration this device made
 * earlier. So the body is the empty object Apple's own docs specify, and the interesting
 * part is entirely in the headers: `apns-topic` is the Pass Type ID, and authentication is
 * mutual TLS with the very certificate that signs the passes — the same one, reused for a
 * second purpose, because Apple ties both to the same Pass Type ID.
 *
 * Deliberately no dependency: Node's built-in `http2` module does HTTP/2 with a client
 * certificate out of the box, and that is the entire feature this needs.
 */

const APNS_HOST = 'https://api.push.apple.com'

export type ApnsResult =
  | { ok: true }
  /** 410 Gone — the device dropped the pass. The caller's job to forget the registration. */
  | { ok: false; deviceGone: true }
  | { ok: false; deviceGone: false; status: number; reason: string }

export function sendPassUpdatePush(
  pushToken: string,
  topic: string,
  cert: string,
  key: string,
): Promise<ApnsResult> {
  return new Promise((resolve) => {
    let settled = false
    const settle = (result: ApnsResult) => {
      if (settled) return
      settled = true
      resolve(result)
    }

    let client: http2.ClientHttp2Session
    try {
      client = http2.connect(APNS_HOST, { cert, key })
    } catch (error) {
      settle({ ok: false, deviceGone: false, status: 0, reason: messageOf(error) })
      return
    }

    // A hung TLS handshake or a stalled response must not hold a stamp booking hostage.
    const timeout = setTimeout(() => {
      client.close()
      settle({ ok: false, deviceGone: false, status: 0, reason: 'timeout' })
    }, 8000)

    client.on('error', (error) => {
      clearTimeout(timeout)
      settle({ ok: false, deviceGone: false, status: 0, reason: messageOf(error) })
    })

    const req = client.request({
      ':method': 'POST',
      ':path': `/3/device/${pushToken}`,
      'apns-topic': topic,
      // "background": this is Wallet asking itself to re-fetch, not a notification a user
      // sees. There is nothing to render, so there is no other push type that fits.
      'apns-push-type': 'background',
      'apns-priority': '5',
    })

    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk: string) => {
      body += chunk
    })

    let status = 0
    req.on('response', (headers) => {
      status = Number(headers[':status'] ?? 0)
    })

    req.on('end', () => {
      clearTimeout(timeout)
      client.close()
      if (status === 200) {
        settle({ ok: true })
        return
      }
      if (status === 410) {
        settle({ ok: false, deviceGone: true })
        return
      }
      const reason = parseReason(body)
      settle({ ok: false, deviceGone: false, status, reason })
    })

    req.on('error', (error) => {
      clearTimeout(timeout)
      client.close()
      settle({ ok: false, deviceGone: false, status: 0, reason: messageOf(error) })
    })

    // The documented payload for a pass-update push: empty, on purpose.
    req.end('{}')
  })
}

function parseReason(body: string): string {
  try {
    const parsed = JSON.parse(body) as { reason?: string }
    return parsed.reason ?? (body || 'unknown')
  } catch {
    return body || 'unknown'
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
