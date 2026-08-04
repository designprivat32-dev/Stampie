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

/** Below this the mark would vanish into the card colour and needs a plate behind it. */
const MIN_MARK_CONTRAST = 1.7

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  }
}

/** WCAG contrast between a known luminance and a hex colour. */
function contrastAgainst(luminance: number, hex: string): number {
  const { r, g, b } = hexToRgb(hex)
  const channel = (c: number) => {
    const v = c / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const other = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
  const lighter = Math.max(luminance, other)
  const darker = Math.min(luminance, other)
  return (lighter + 0.05) / (darker + 0.05)
}

function round(n: number, digits = 2): number {
  const f = 10 ** digits
  return Math.round(n * f) / f
}

/**
 * Fraction of the canvas the trimmed mark occupies.
 *
 * With a transparent surround there is no square edge left to hide, so the mark can run
 * much closer to the edge than the 0.62 it started at. Corners of a *bounding box* this
 * size would fall outside an inscribed circle, but the corners of a logo are empty by
 * construction — what matters is the mark's own extent along the axes, and that stays
 * inside.
 */
const LOGO_INSET = 0.82

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

  // Trim the file's empty margin and punch it out to transparency. Google places our
  // square inside its own round container, so anything opaque reads as a block in a ring.
  const framed = await frameLogo(logoPng)

  // Transparent unless the mark would disappear against the card colour — a dark mark on
  // a dark card is worse than a visible plate behind it.
  const cardColour = safeColor(design.backgroundColor, '#1a1a1a')
  // A plate only when *neither* the dark nor the light ink stands out from the card.
  const inkContrast = Math.max(
    framed.markDark === null ? 0 : contrastAgainst(framed.markDark, cardColour),
    framed.markLight === null ? 0 : contrastAgainst(framed.markLight, cardColour),
  )
  const needsPlate = framed.backdrop !== null && inkContrast < MIN_MARK_CONTRAST

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
      background: needsPlate
        ? { ...hexToRgb(framed.backdrop!), alpha: 1 }
        : { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: scaled, gravity: 'centre' }])
    .png({ compressionLevel: 9 })
    .toBuffer()
}
