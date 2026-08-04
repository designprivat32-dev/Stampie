import sharp from 'sharp'

/**
 * Prepares an uploaded logo for a circular crop.
 *
 * Two things make a logo look lost inside Google's circular programLogo:
 *
 *   1. the file itself usually carries a wide empty margin around the mark, and
 *   2. scaling the *whole file* to fit means scaling that margin too.
 *
 * So the flat border is trimmed away first and only the mark is scaled. If that border was
 * opaque — a JPEG exported on a white sheet — its colour is reported back, so the canvas
 * can be filled with it instead of the card colour: a bright square inside a dark ring is
 * exactly what the circular crop turns a mismatch into.
 */

export interface FramedLogo {
  /** The mark with its uniform margin removed. */
  image: Buffer
  /** Hex colour of the removed margin, or null when it was transparent. */
  backdrop: string | null
}

/** How far a pixel may differ from the corner and still count as margin. */
const TRIM_THRESHOLD = 12

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`
}

export async function frameLogo(input: Buffer): Promise<FramedLogo> {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { width, height, channels } = info
  if (width < 4 || height < 4) return { image: input, backdrop: null }

  const at = (x: number, y: number) => (y * width + x) * channels
  const corners = [at(0, 0), at(width - 1, 0), at(0, height - 1), at(width - 1, height - 1)]

  const sample = (offset: number) => ({
    r: data[offset]!,
    g: data[offset + 1]!,
    b: data[offset + 2]!,
    a: data[channels === 4 ? offset + 3 : offset]!,
  })

  const first = sample(corners[0]!)
  // Corners that disagree mean the border is part of the artwork; leave it alone.
  const uniform = corners.every((offset) => {
    const c = sample(offset)
    return (
      Math.abs(c.r - first.r) <= TRIM_THRESHOLD &&
      Math.abs(c.g - first.g) <= TRIM_THRESHOLD &&
      Math.abs(c.b - first.b) <= TRIM_THRESHOLD &&
      Math.abs(c.a - first.a) <= TRIM_THRESHOLD
    )
  })

  if (!uniform) return { image: input, backdrop: null }

  const transparent = channels === 4 && first.a < 16
  const backdrop = transparent ? null : toHex(first.r, first.g, first.b)

  try {
    const image = await sharp(input)
      .trim({ background: backdrop ?? '#00000000', threshold: TRIM_THRESHOLD })
      .png()
      .toBuffer()

    // A fully uniform image trims to nothing — keep the original rather than a 1px dot.
    const meta = await sharp(image).metadata()
    if (!meta.width || !meta.height || meta.width < 8 || meta.height < 8) {
      return { image: input, backdrop }
    }
    return { image, backdrop }
  } catch {
    // sharp throws when there is nothing to trim.
    return { image: input, backdrop }
  }
}
