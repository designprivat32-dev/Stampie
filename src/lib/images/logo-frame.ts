import sharp from 'sharp'

/**
 * Prepares an uploaded logo for Google's circular programLogo.
 *
 * Google does not crop our image to a circle. It draws its own round container, fills it
 * with a colour of its choosing and places our square *inside* it with padding. Anything
 * opaque we deliver is therefore visible as a square sitting in a ring — no amount of
 * scaling hides that edge.
 *
 * Two steps:
 *
 *   1. trim the flat margin the file carries, so the mark itself gets scaled up rather
 *      than the empty space around it, and
 *   2. punch that margin out to transparency, so only the mark remains and Google's
 *      container shows through instead of a pale block.
 *
 * The punch-out is a flood fill from the border, never a global colour match — a global
 * match would also hole out light areas *inside* the mark, like the gaps between fingers.
 */

export interface FramedLogo {
  /** The mark, trimmed and with its flat surround made transparent. */
  image: Buffer
  /** Hex colour of the removed surround, or null when it was already transparent. */
  backdrop: string | null
  /**
   * Luminance extremes of the visible pixels, 0..1.
   *
   * The *mean* is the wrong measure: a hand outline encloses areas of the original sheet
   * that are not border-connected and therefore stay, dragging the average towards the
   * background. What decides whether a logo reads is its darkest or lightest ink, whichever
   * differs more from the card.
   */
  markDark: number | null
  markLight: number | null
}

/** How far a pixel may differ from the corner and still count as surround. */
const TOLERANCE = 22
const TOLERANCE_SQUARED = TOLERANCE * TOLERANCE

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`
}

export async function frameLogo(input: Buffer): Promise<FramedLogo> {
  const probe = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = probe.info
  if (width < 4 || height < 4 || channels !== 4) {
    return { image: input, backdrop: null, markDark: null, markLight: null }
  }

  const data = probe.data
  const at = (x: number, y: number) => (y * width + x) * channels
  const corners = [at(0, 0), at(width - 1, 0), at(0, height - 1), at(width - 1, height - 1)]
  const first = corners[0]!

  // Corners that disagree mean the border belongs to the artwork; leave it alone.
  const uniform = corners.every((offset) => {
    const dr = data[offset]! - data[first]!
    const dg = data[offset + 1]! - data[first + 1]!
    const db = data[offset + 2]! - data[first + 2]!
    const da = data[offset + 3]! - data[first + 3]!
    return dr * dr + dg * dg + db * db <= TOLERANCE_SQUARED && Math.abs(da) <= TOLERANCE
  })
  if (!uniform) return { image: input, backdrop: null, markDark: null, markLight: null }

  const alreadyTransparent = data[first + 3]! < 16
  const backdrop = alreadyTransparent ? null : toHex(data[first]!, data[first + 1]!, data[first + 2]!)

  // Trim first, so it is the mark and not the empty space that gets scaled later.
  let trimmed = input
  try {
    const candidate = await sharp(input)
      .trim({ background: backdrop ?? '#00000000', threshold: TOLERANCE })
      .png()
      .toBuffer()
    const meta = await sharp(candidate).metadata()
    if (meta.width && meta.height && meta.width >= 8 && meta.height >= 8) trimmed = candidate
  } catch {
    // sharp throws when there is nothing to trim.
  }

  const image = alreadyTransparent ? trimmed : await punchOutBorder(trimmed, backdrop!)
  const extremes = await luminanceExtremes(image)
  return { image, backdrop, ...extremes }
}

/**
 * Flood-fills the surround to transparent, leaving interior areas intact.
 *
 * The reference is the colour measured *before* trimming, never a pixel of the trimmed
 * image: trimming stops at the mark, so a corner of the result is ink whenever the mark
 * reaches into it, and filling from there would erase the logo instead of its surround.
 */
async function punchOutBorder(input: Buffer, backdrop: string): Promise<Buffer> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info
  if (channels !== 4) return input

  const pixels = width * height
  const reference = [
    parseInt(backdrop.slice(1, 3), 16),
    parseInt(backdrop.slice(3, 5), 16),
    parseInt(backdrop.slice(5, 7), 16),
  ]

  const visited = new Uint8Array(pixels)
  const queue = new Int32Array(pixels)
  let head = 0
  let tail = 0

  const push = (x: number, y: number) => {
    const flat = y * width + x
    if (visited[flat]) return
    const offset = flat * channels
    const dr = data[offset]! - reference[0]!
    const dg = data[offset + 1]! - reference[1]!
    const db = data[offset + 2]! - reference[2]!
    if (dr * dr + dg * dg + db * db > TOLERANCE_SQUARED) return
    visited[flat] = 1
    queue[tail++] = flat
  }

  for (let x = 0; x < width; x++) {
    push(x, 0)
    push(x, height - 1)
  }
  for (let y = 0; y < height; y++) {
    push(0, y)
    push(width - 1, y)
  }

  while (head < tail) {
    const flat = queue[head++]!
    const x = flat % width
    const y = (flat - x) / width
    if (x > 0) push(x - 1, y)
    if (x < width - 1) push(x + 1, y)
    if (y > 0) push(x, y - 1)
    if (y < height - 1) push(x, y + 1)
  }

  // Removing nearly everything means the detection was wrong, not that the logo is empty.
  if (tail / pixels > 0.97) return input

  const out = Buffer.from(data)
  for (let flat = 0; flat < pixels; flat++) {
    if (visited[flat]) out[flat * channels + 3] = 0
  }

  return sharp(out, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer()
}

/**
 * 10th and 90th *relative* (WCAG-linearised) luminance percentile of the visible pixels.
 *
 * Percentiles rather than the outright min and max, so a handful of anti-aliased pixels
 * cannot decide whether a plate is drawn behind the logo.
 */
async function luminanceExtremes(
  input: Buffer,
): Promise<{ markDark: number | null; markLight: number | null }> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  if (info.channels !== 4) return { markDark: null, markLight: null }

  // 256 buckets is plenty and avoids sorting a million floats.
  const linear = Array.from({ length: 256 }, (_, c) => {
    const v = c / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  const histogram = new Uint32Array(256)
  let count = 0
  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3]! < 32) continue
    const luminance =
      0.2126 * data[offset]! + 0.7152 * data[offset + 1]! + 0.0722 * data[offset + 2]!
    histogram[Math.min(255, Math.round(luminance))]!++
    count++
  }
  if (count === 0) return { markDark: null, markLight: null }

  const percentile = (share: number): number => {
    const target = count * share
    let seen = 0
    for (let bucket = 0; bucket < 256; bucket++) {
      seen += histogram[bucket]!
      if (seen >= target) return linear[bucket]!
    }
    return 1
  }

  return { markDark: percentile(0.1), markLight: percentile(0.9) }
}
