'use server'

import { z } from 'zod'
import { assertCardAccess } from '@/lib/auth/session'
import { fail, fromZodError, guarded, ok, type ActionResult } from '@/lib/action-result'
import { prisma } from '@/lib/db'
import { assetKey, getStorage, variantKey } from '@/lib/storage'
import { deriveIconFromLogo, processUpload, UploadValidationError } from '@/lib/images/pipeline'
import { KIND_SPECS, MAX_UPLOAD_BYTES, type AssetKind } from '@/lib/images/upload-constraints'
import { extractPalette, type PaletteSuggestion } from '@/lib/color/extract-palette'
import { invalidateStripCache } from '@/lib/cards/strip-service'
import { rateLimit } from '@/lib/rate-limit'

/**
 * Derived from KIND_SPECS rather than written out again: a hand-maintained copy silently
 * rejects every kind added elsewhere, and the only symptom is a validation error in the
 * upload dialog.
 */
const ASSET_KINDS = Object.keys(KIND_SPECS) as [AssetKind, ...AssetKind[]]

const cropSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
})

export interface UploadedAsset {
  id: string
  kind: AssetKind
  width: number
  height: number
  url: string
  /** Only present for logo uploads. */
  palette?: PaletteSuggestion
}

/**
 * Upload entry point. FormData rather than a JSON body so the browser streams the file.
 * The declared MIME type and the file name are ignored — see `magic-bytes.ts`.
 */
export async function uploadAssetAction(formData: FormData): Promise<ActionResult<UploadedAsset>> {
  return guarded(async () => {
    const cardId = String(formData.get('cardId') ?? '')
    const kindRaw = String(formData.get('kind') ?? '')
    const file = formData.get('file')

    const parsed = z
      .object({ cardId: z.string().cuid(), kind: z.enum(ASSET_KINDS) })
      .safeParse({ cardId, kind: kindRaw })
    if (!parsed.success) return fromZodError(parsed.error)

    const { cardId: safeCardId, kind } = parsed.data
    await assertCardAccess(safeCardId)

    const limit = rateLimit(`upload:${safeCardId}`, 60, 60 * 60 * 1000)
    if (!limit.allowed) {
      return fail('Zu viele Uploads. Bitte in einer Stunde erneut versuchen.', 'rate_limited')
    }

    if (!(file instanceof File)) return fail('Es wurde keine Datei übermittelt.', 'validation')
    if (file.size > MAX_UPLOAD_BYTES) return fail('Die Datei ist größer als 5 MB.', 'validation')

    let crop = null
    const cropRaw = formData.get('crop')
    if (typeof cropRaw === 'string' && cropRaw.length > 0) {
      const cropParsed = cropSchema.safeParse(JSON.parse(cropRaw))
      if (!cropParsed.success) return fromZodError(cropParsed.error)
      crop = cropParsed.data
    }

    const input = Buffer.from(await file.arrayBuffer())

    let processed
    try {
      processed = await processUpload(input, kind, { crop })
    } catch (e) {
      if (e instanceof UploadValidationError) return fail(e.message, 'validation')
      throw e
    }

    const primary = processed.variants[0]
    if (!primary) return fail('Das Bild konnte nicht verarbeitet werden.', 'internal')

    const asset = await prisma.asset.create({
      data: {
        cardId: safeCardId,
        kind,
        mimeType: 'image/png',
        width: primary.width,
        height: primary.height,
        bytes: processed.bytes,
        storageKey: '',
      },
    })

    const key = assetKey(safeCardId, kind, asset.id)
    const storage = await getStorage()
    await Promise.all(
      processed.variants.map((v) => storage.put(variantKey(key, v.scale), v.data, 'image/png')),
    )
    await prisma.asset.update({ where: { id: asset.id }, data: { storageKey: key } })

    invalidateStripCache()

    const result: UploadedAsset = {
      id: asset.id,
      kind,
      width: primary.width,
      height: primary.height,
      url: storage.publicUrl(variantKey(key, 1)),
    }

    // The dominant colours of the logo are the palette we offer in the branding tab.
    if (kind === 'LOGO') {
      result.palette = await extractPalette(primary.data)
    }

    return ok(result)
  })
}

/** "Aus Logo generieren" — square-crops an existing logo asset into a 29x29 icon. */
export async function deriveIconAction(
  cardId: string,
  logoAssetId: string,
): Promise<ActionResult<UploadedAsset>> {
  return guarded(async () => {
    const parsed = z
      .object({ cardId: z.string().cuid(), logoAssetId: z.string().cuid() })
      .safeParse({ cardId, logoAssetId })
    if (!parsed.success) return fromZodError(parsed.error)

    await assertCardAccess(parsed.data.cardId)

    const logo = await prisma.asset.findFirst({
      where: { id: parsed.data.logoAssetId, cardId: parsed.data.cardId, kind: 'LOGO' },
      select: { storageKey: true },
    })
    if (!logo) return fail('Das Logo wurde nicht gefunden.', 'not_found')

    const storage = await getStorage()
    // Use the @3x logo so the derived icon has pixels to spare.
    const source = (await storage.get(variantKey(logo.storageKey, 3))) ??
      (await storage.get(variantKey(logo.storageKey, 1)))
    if (!source) return fail('Das Logo konnte nicht geladen werden.', 'not_found')

    let processed
    try {
      processed = await deriveIconFromLogo(source)
    } catch (e) {
      if (e instanceof UploadValidationError) return fail(e.message, 'validation')
      throw e
    }

    const primary = processed.variants[0]
    if (!primary) return fail('Das Icon konnte nicht erzeugt werden.', 'internal')

    const asset = await prisma.asset.create({
      data: {
        cardId: parsed.data.cardId,
        kind: 'ICON',
        mimeType: 'image/png',
        width: primary.width,
        height: primary.height,
        bytes: processed.bytes,
        storageKey: '',
      },
    })

    const key = assetKey(parsed.data.cardId, 'ICON', asset.id)
    await Promise.all(
      processed.variants.map((v) => storage.put(variantKey(key, v.scale), v.data, 'image/png')),
    )
    await prisma.asset.update({ where: { id: asset.id }, data: { storageKey: key } })
    invalidateStripCache()

    return ok({
      id: asset.id,
      kind: 'ICON' as const,
      width: primary.width,
      height: primary.height,
      url: storage.publicUrl(variantKey(key, 1)),
    })
  })
}

export async function deleteAssetAction(
  cardId: string,
  assetId: string,
): Promise<ActionResult<null>> {
  return guarded(async () => {
    await assertCardAccess(cardId)

    const asset = await prisma.asset.findFirst({
      where: { id: assetId, cardId },
      select: { id: true, storageKey: true },
    })
    if (!asset) return fail('Diese Datei wurde nicht gefunden.', 'not_found')

    const storage = await getStorage()
    await Promise.all(
      ([1, 2, 3] as const).map((s) => storage.delete(variantKey(asset.storageKey, s))),
    )
    await prisma.asset.delete({ where: { id: asset.id } })
    invalidateStripCache()

    return ok(null)
  })
}
