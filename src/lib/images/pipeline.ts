import 'server-only'
import sharp from 'sharp'
import { detectImageType, type DetectedImageType } from './magic-bytes'
import { sanitizeSvg, UnsafeSvgError } from './sanitize-svg'
import { KIND_SPECS, MAX_UPLOAD_BYTES, type AssetKind, type CropRect } from './upload-constraints'

/**
 * Upload pipeline: validate -> sanitise -> re-encode -> emit fixed-size variants.
 *
 * Everything that leaves this module is a freshly encoded PNG produced by sharp from
 * decoded pixels. EXIF, colour-profile payloads, appended ZIP archives and anything else
 * riding along in the original file do not survive that round trip.
 *
 * Limits and sizes live in `upload-constraints.ts` so the browser can share them without
 * pulling sharp into the client bundle.
 */

export class UploadValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UploadValidationError'
  }
}

export interface ProcessedVariant {
  scale: 1 | 2 | 3
  width: number
  height: number
  data: Buffer
}

export interface ProcessedUpload {
  kind: AssetKind
  sourceType: DetectedImageType
  variants: ProcessedVariant[]
  /** Total bytes across all variants — stored on the Asset row. */
  bytes: number
}

export interface ProcessUploadOptions {
  crop?: CropRect | null
}

export async function processUpload(
  input: Buffer,
  kind: AssetKind,
  options: ProcessUploadOptions = {},
): Promise<ProcessedUpload> {
  if (input.length === 0) throw new UploadValidationError('Die Datei ist leer.')
  if (input.length > MAX_UPLOAD_BYTES) {
    throw new UploadValidationError('Die Datei ist größer als 5 MB.')
  }

  const type = detectImageType(input)
  if (!type) {
    throw new UploadValidationError('Nur PNG, JPG oder SVG werden unterstützt.')
  }

  let source = input
  if (type === 'svg') {
    try {
      source = sanitizeSvg(input)
    } catch (e) {
      if (e instanceof UnsafeSvgError) throw new UploadValidationError(e.message)
      throw e
    }
  }

  const spec = KIND_SPECS[kind]

  // Decode once, crop once, then derive every variant from the same pipeline.
  let base = sharp(source, { failOn: 'error', density: type === 'svg' ? 384 : 72 })
  const meta = await base.metadata()
  if (!meta.width || !meta.height) {
    throw new UploadValidationError('Das Bild konnte nicht gelesen werden.')
  }

  if (options.crop) {
    const crop = clampCrop(options.crop, meta.width, meta.height)
    base = base.extract(crop)
  }

  const variants: ProcessedVariant[] = []
  for (const scale of spec.scales) {
    const width = spec.width * scale
    const height = spec.height * scale
    const data = await sharp(await base.clone().toBuffer(), {
      density: type === 'svg' ? 384 : 72,
    })
      // rotate() with no argument applies (and then drops) the EXIF orientation.
      .rotate()
      .resize({
        width,
        height,
        fit: spec.fit,
        position: 'centre',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        withoutEnlargement: false,
      })
      .png({ compressionLevel: 9 })
      .toBuffer()
    variants.push({ scale, width, height, data })
  }

  return {
    kind,
    sourceType: type,
    variants,
    bytes: variants.reduce((sum, v) => sum + v.data.length, 0),
  }
}

function clampCrop(crop: CropRect, imageWidth: number, imageHeight: number) {
  const left = Math.max(0, Math.min(Math.round(crop.x), imageWidth - 1))
  const top = Math.max(0, Math.min(Math.round(crop.y), imageHeight - 1))
  const width = Math.max(1, Math.min(Math.round(crop.width), imageWidth - left))
  const height = Math.max(1, Math.min(Math.round(crop.height), imageHeight - top))
  return { left, top, width, height }
}

/**
 * "Aus Logo generieren": square-crops the centre of the logo into a 29x29 icon.
 * Runs on the already-processed logo, so it inherits the same re-encode guarantees.
 */
export async function deriveIconFromLogo(logoPng: Buffer): Promise<ProcessedUpload> {
  const meta = await sharp(logoPng).metadata()
  const size = Math.min(meta.width ?? 0, meta.height ?? 0)
  if (size <= 0) throw new UploadValidationError('Das Logo konnte nicht gelesen werden.')

  const squared = await sharp(logoPng)
    .extract({
      left: Math.round(((meta.width ?? size) - size) / 2),
      top: Math.round(((meta.height ?? size) - size) / 2),
      width: size,
      height: size,
    })
    .png()
    .toBuffer()

  return processUpload(squared, 'ICON')
}
