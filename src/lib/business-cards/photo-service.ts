import 'server-only'
import { prisma } from '@/lib/db'
import { getStorage, variantKey } from '@/lib/storage'
import type { ScaledPng } from '@/lib/pass/pass-builder'

/**
 * Das Foto einer Person — als Bytes für Apple (`thumbnail.png`) und vCard, als öffentliche
 * Adresse für Google und die Webseiten.
 *
 * Immer auf die Karte und auf die Art `CONTACT_PHOTO` eingegrenzt: eine Asset-Id aus einer
 * anderen Karte oder ein Logo löst hier schlicht nicht auf.
 */

async function findPhoto(cardId: string, assetId: string | null): Promise<{ storageKey: string } | null> {
  if (!assetId) return null
  return prisma.asset.findFirst({
    where: { id: assetId, cardId, kind: 'CONTACT_PHOTO' },
    select: { storageKey: true },
  })
}

export async function loadContactPhoto(cardId: string, assetId: string | null): Promise<ScaledPng | null> {
  const asset = await findPhoto(cardId, assetId)
  if (!asset) return null
  const storage = await getStorage()
  const [one, two, three] = await Promise.all([
    storage.get(variantKey(asset.storageKey, 1)),
    storage.get(variantKey(asset.storageKey, 2)),
    storage.get(variantKey(asset.storageKey, 3)),
  ])
  if (!one) return null
  const result: ScaledPng = { '1x': one }
  if (two) result['2x'] = two
  if (three) result['3x'] = three
  return result
}

/** Größte Fassung (270 px) — für Google und die Webseiten, die sie verkleinert anzeigen. */
export async function contactPhotoUrl(cardId: string, assetId: string | null): Promise<string | null> {
  const asset = await findPhoto(cardId, assetId)
  if (!asset) return null
  return (await getStorage()).publicUrl(variantKey(asset.storageKey, 3))
}

/** Prüft beim Speichern, dass das Foto zu dieser Karte gehört. */
export async function isContactPhotoOfCard(cardId: string, assetId: string): Promise<boolean> {
  return (await findPhoto(cardId, assetId)) !== null
}
