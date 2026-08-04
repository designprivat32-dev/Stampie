import sharp from 'sharp'
import { frameLogo } from '@/lib/images/logo-frame'
import { resolveStampIcon } from './stamp-icons'
import { HEX_COLOR_RE } from './schema'
import type { CardDesignInput } from './schema'

/**
 * Square fallback logo.
 *
 * Google Wallet lists `programLogo` as a *required* field on LoyaltyClass — a class
 * without it is rejected, and the only feedback the user gets is a generic
 * "Something went wrong". Shop owners routinely try the test card before uploading a
 * logo, so a design without one still has to produce a valid class.
 *
 * The fallback draws the chosen stamp icon in the card's own colours, which reads as a
 * deliberate mark rather than a placeholder.
 */

/** Google's recommended programLogo size. */
export const WALLET_LOGO_SIZE = 660

export type LogoDesign = Pick<
  CardDesignInput,
  'foregroundColor' | 'backgroundColor' | 'stampIcon'
>

function safeColor(value: string, fallback: string): string {
  return HEX_COLOR_RE.test(value) ? value.toLowerCase() : fallback
}

export function buildLogoSvg(design: LogoDesign, size = WALLET_LOGO_SIZE): string {
  const foreground = safeColor(design.foregroundColor, '#ffffff')
  const background = safeColor(design.backgroundColor, '#1a1a1a')
  const icon = resolveStampIcon(design.stampIcon)

  // Google crops this square to its inscribed circle, so the icon may span up to 1/√2 of
  // the edge before its corners leave the ring. Sitting well below that is what made the
  // generated logo look like a dot in a saucer.
  const iconBox = size * 0.68
  const offset = (size - iconBox) / 2
  const scale = iconBox / 24

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
    `<rect width="${size}" height="${size}" fill="${background}"/>`,
    `<path d="${icon.path}" fill="${foreground}" fill-rule="${icon.fillRule}"`,
    ` transform="translate(${round(offset)} ${round(offset)}) scale(${round(scale, 4)})"/>`,
    `</svg>`,
  ].join('')
}

function round(n: number, digits = 2): number {
  const f = 10 ** digits
  return Math.round(n * f) / f
}

/**
 * Up to which aspect ratio a mark is cropped to fill the circle rather than fitted inside it.
 *
 * Fitting *everything* inside the ring is what kept the logo small: a square mark fitted
 * whole can never span more than 1/√2 ≈ 0.707 of the circle, so it always reads as a stamp
 * floating in a saucer. Round avatars do not work that way — they cover, and the corners go.
 *
 * That is right for anything roughly square (icons, badges, monograms) and wrong for a
 * wordmark, where cropping the ends removes letters. So near-square marks cover, wide marks
 * fall back to fitting their diagonal in the circle.
 */
const COVER_ASPECT_LIMIT = 1.4

/** Slack on the diagonal fit, so a fitted mark does not graze the crop edge. */
const DIAGONAL_FIT = 0.98

/** Scales the trimmed mark to the placement the circular crop calls for. */
async function placeInCircle(mark: Buffer, size: number): Promise<Buffer> {
  const { width = size, height = size } = await sharp(mark).metadata()
  const aspect = Math.max(width, height) / Math.min(width, height)

  if (aspect <= COVER_ASPECT_LIMIT) {
    // Cover: the shorter edge spans the full diameter, the longer one overhangs and is cut.
    return sharp(mark)
      .resize({ width: size, height: size, fit: 'cover', position: 'centre' })
      .png()
      .toBuffer()
  }

  // Fit the mark's diagonal to the diameter — the widest a wordmark can be drawn without
  // any of it falling outside the circle.
  const factor = (size * DIAGONAL_FIT) / Math.hypot(width, height)
  return sharp(mark)
    .resize({
      width: Math.max(1, Math.round(width * factor)),
      height: Math.max(1, Math.round(height * factor)),
      fit: 'fill',
    })
    .png()
    .toBuffer()
}

export async function renderLogoImage(
  design: LogoDesign,
  size = WALLET_LOGO_SIZE,
  /**
   * The uploaded logo, if there is one. It is processed to Apple's 160x50 spec, which is
   * the wrong shape for Google — so it gets centred on the card colour rather than being
   * handed over as-is.
   */
  logoPng?: Buffer | null,
): Promise<Buffer> {
  if (!logoPng) {
    const svg = buildLogoSvg(design, size)
    return sharp(Buffer.from(svg, 'utf8')).png({ compressionLevel: 9 }).toBuffer()
  }

  // Trim the file's own empty margin first — otherwise that margin is scaled along with
  // the mark and the logo ends up a dot in the middle of the circle.
  const framed = await frameLogo(logoPng)

  // An opaque margin becomes the canvas colour. The square edge then disappears instead
  // of showing up as a bright block inside the circular crop.
  const background = framed.backdrop ?? safeColor(design.backgroundColor, '#1a1a1a')
  const scaled = await placeInCircle(framed.image, size)

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background,
    },
  })
    .composite([{ input: scaled, gravity: 'centre' }])
    .png({ compressionLevel: 9 })
    .toBuffer()
}
