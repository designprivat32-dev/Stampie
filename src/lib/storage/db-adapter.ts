import 'server-only'
import { prisma } from '@/lib/db'
import { appUrl } from '@/lib/app-url'
import type { StorageAdapter } from './index'

/**
 * Stores asset bytes in PostgreSQL.
 *
 * This is the default on serverless hosting: there is no writable filesystem, and
 * provisioning an object store for a few logos per location is not worth the operational
 * surface. Assets are small and fixed-size by the time they get here — the pipeline caps
 * uploads at 5 MB and re-encodes every variant to a known dimension.
 */
export class DbStorageAdapter implements StorageAdapter {
  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    // Prisma's Bytes maps to Uint8Array<ArrayBuffer>; a Node Buffer may be backed by a
    // SharedArrayBuffer, so copy into a plain view rather than casting the type away.
    const data = Uint8Array.from(body)
    await prisma.assetBlob.upsert({
      where: { key },
      create: { key, data, contentType },
      update: { data, contentType },
    })
  }

  async get(key: string): Promise<Buffer | null> {
    const row = await prisma.assetBlob.findUnique({ where: { key }, select: { data: true } })
    return row ? Buffer.from(row.data) : null
  }

  async delete(key: string): Promise<void> {
    await prisma.assetBlob.deleteMany({ where: { key } })
  }

  async exists(key: string): Promise<boolean> {
    const row = await prisma.assetBlob.findUnique({ where: { key }, select: { key: true } })
    return row !== null
  }

  publicUrl(key: string): string {
    // Absolute, because Google Wallet fetches these URLs from its own servers.
    return `${appUrl()}/api/assets/${key}`
  }
}
