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

  // Icon occupies the middle 52% so it keeps clear of Wallet's circular cropping.
  const iconBox = size * 0.52
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
 * Fraction of the square the trimmed mark may occupy.
 *
 * Google crops `programLogo` to a circle. A square inscribed in that circle measures
 * 1/√2 ≈ 0.707 of the edge, so anything below that keeps every corner of the mark visible
 * while still filling the ring. The earlier 0.62 left the logo floating in empty space —
 * and because the file's own margin was scaled along with it, the mark ended up tiny.
 */
const LOGO_INSET = 0.7

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
  const inner = Math.round(size * LOGO_INSET)

  const scaled = await sharp(framed.image)
    .resize({ width: inner, height: inner, fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer()

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
