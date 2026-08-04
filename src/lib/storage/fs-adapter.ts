import 'server-only'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { appUrl } from '@/lib/app-url'
import type { StorageAdapter } from './index'

/**
 * Local filesystem adapter for development. Keys are slash-separated and never contain
 * `..` (they are built from cuids), but the join is still resolved and range-checked.
 */
export class FsStorageAdapter implements StorageAdapter {
  private readonly root: string

  constructor(root = process.env.STORAGE_FS_ROOT ?? './storage') {
    this.root = path.resolve(root)
  }

  private resolve(key: string): string {
    const full = path.resolve(this.root, key)
    if (!full.startsWith(this.root + path.sep) && full !== this.root) {
      throw new Error('Invalid storage key')
    }
    return full
  }

  // `contentType` is part of the StorageAdapter contract but has no meaning on a
  // filesystem — it is carried so callers can stay adapter-agnostic.
  async put(key: string, body: Buffer, _contentType?: string): Promise<void> {
    const full = this.resolve(key)
    await mkdir(path.dirname(full), { recursive: true })
    await writeFile(full, body)
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.resolve(key))
    } catch {
      return null
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true })
  }

  async exists(key: string): Promise<boolean> {
    return existsSync(this.resolve(key))
  }

  publicUrl(key: string): string {
    const base = appUrl()
    return `${base}/api/assets/${key}`
  }
}
