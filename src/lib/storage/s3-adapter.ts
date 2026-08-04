import 'server-only'
import { createHash, createHmac } from 'node:crypto'
import type { StorageAdapter } from './index'

/**
 * S3-compatible adapter using SigV4 over plain fetch — no AWS SDK, because the only
 * operations we need are PUT/GET/DELETE/HEAD on a single bucket and the SDK is 20 MB.
 * Works against AWS S3, MinIO, Hetzner Object Storage, Cloudflare R2.
 */
export class S3StorageAdapter implements StorageAdapter {
  private readonly endpoint: string
  private readonly region: string
  private readonly bucket: string
  private readonly accessKeyId: string
  private readonly secretAccessKey: string
  private readonly publicBase: string

  constructor() {
    this.endpoint = requireEnv('S3_ENDPOINT').replace(/\/$/, '')
    this.region = process.env.S3_REGION ?? 'eu-central-1'
    this.bucket = requireEnv('S3_BUCKET')
    this.accessKeyId = requireEnv('S3_ACCESS_KEY_ID')
    this.secretAccessKey = requireEnv('S3_SECRET_ACCESS_KEY')
    this.publicBase = (process.env.S3_PUBLIC_BASE_URL ?? `${this.endpoint}/${this.bucket}`).replace(/\/$/, '')
  }

  private url(key: string): string {
    return `${this.endpoint}/${this.bucket}/${key}`
  }

  private async request(
    method: 'PUT' | 'GET' | 'DELETE' | 'HEAD',
    key: string,
    body?: Buffer,
    contentType?: string,
  ): Promise<Response> {
    const url = new URL(this.url(key))
    const now = new Date()
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
    const dateStamp = amzDate.slice(0, 8)
    const payloadHash = createHash('sha256')
      .update(body ?? Buffer.alloc(0))
      .digest('hex')

    const headers: Record<string, string> = {
      host: url.host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    }
    if (contentType) headers['content-type'] = contentType

    const signedHeaders = Object.keys(headers).sort()
    const canonicalHeaders = signedHeaders.map((h) => `${h}:${headers[h]}\n`).join('')
    const signedHeaderList = signedHeaders.join(';')

    const canonicalRequest = [
      method,
      url.pathname,
      '',
      canonicalHeaders,
      signedHeaderList,
      payloadHash,
    ].join('\n')

    const scope = `${dateStamp}/${this.region}/s3/aws4_request`
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      scope,
      createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n')

    const kDate = createHmac('sha256', `AWS4${this.secretAccessKey}`).update(dateStamp).digest()
    const kRegion = createHmac('sha256', kDate).update(this.region).digest()
    const kService = createHmac('sha256', kRegion).update('s3').digest()
    const kSigning = createHmac('sha256', kService).update('aws4_request').digest()
    const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex')

    headers['authorization'] =
      `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${scope}, SignedHeaders=${signedHeaderList}, Signature=${signature}`

    return fetch(url, { method, headers, body: body ? new Uint8Array(body) : undefined })
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    const res = await this.request('PUT', key, body, contentType)
    if (!res.ok) throw new Error(`S3 PUT ${key} failed: ${res.status}`)
  }

  async get(key: string): Promise<Buffer | null> {
    const res = await this.request('GET', key)
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`S3 GET ${key} failed: ${res.status}`)
    return Buffer.from(await res.arrayBuffer())
  }

  async delete(key: string): Promise<void> {
    const res = await this.request('DELETE', key)
    if (!res.ok && res.status !== 404) throw new Error(`S3 DELETE ${key} failed: ${res.status}`)
  }

  async exists(key: string): Promise<boolean> {
    const res = await this.request('HEAD', key)
    return res.ok
  }

  publicUrl(key: string): string {
    return `${this.publicBase}/${key}`
  }
}

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing environment variable ${name}`)
  return v
}
