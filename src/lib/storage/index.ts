/**
 * Storage abstraction. Production uses an S3-compatible bucket; development writes to the
 * local filesystem. Nothing above this layer knows which one is active.
 */
export interface StorageAdapter {
  put(key: string, body: Buffer, contentType: string): Promise<void>
  get(key: string): Promise<Buffer | null>
  delete(key: string): Promise<void>
  exists(key: string): Promise<boolean>
  /** Public URL for embedding into a wallet pass or an <img>. */
  publicUrl(key: string): string
}

let adapter: StorageAdapter | null = null

/**
 * `db` is the default: it works everywhere, including serverless hosts with no writable
 * filesystem. `fs` is handy when developing against a local checkout, `s3` is the path
 * once asset volume outgrows the database.
 */
export type StorageDriver = 'db' | 'fs' | 's3'

export async function getStorage(): Promise<StorageAdapter> {
  if (adapter) return adapter

  const driver = (process.env.STORAGE_DRIVER ?? 'db') as StorageDriver
  switch (driver) {
    case 's3': {
      const { S3StorageAdapter } = await import('./s3-adapter')
      adapter = new S3StorageAdapter()
      break
    }
    case 'fs': {
      const { FsStorageAdapter } = await import('./fs-adapter')
      adapter = new FsStorageAdapter()
      break
    }
    default: {
      const { DbStorageAdapter } = await import('./db-adapter')
      adapter = new DbStorageAdapter()
    }
  }
  return adapter
}

/** Test seam. */
export function setStorage(next: StorageAdapter | null): void {
  adapter = next
}

/** `cards/<cardId>/<kind>/<assetId>` — variants append `@1x.png` etc. */
export function assetKey(cardId: string, kind: string, assetId: string): string {
  return `cards/${cardId}/${kind.toLowerCase()}/${assetId}`
}

export function variantKey(baseKey: string, scale: 1 | 2 | 3): string {
  return `${baseKey}@${scale}x.png`
}
