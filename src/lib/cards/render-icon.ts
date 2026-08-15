import sharp from 'sharp'
import type { CardDesignInput } from './schema'

/**
 * Fallback `icon.png` for Apple Wallet.
 *
 * icon.png is the one asset PassKit treats as mandatory — a bundle without it is refused
 * with no explanation on the device. A shop that has not uploaded a logo yet would
 * therefore never be able to test its card, so a monogram tile in the card's own colours
 * stands in until a real icon is set.
 *
 * Sizes are Apple's: 29pt at @1x/@2x/@3x.
 */

export const APPLE_ICON_SIZES: Record<'1x' | '2x' | '3x', number> = {
  '1x': 29,
  '2x': 58,
  '3x': 87,
}

type IconDesign = Pick<
  CardDesignInput,
  'programName' | 'cardTitle' | 'backgroundColor' | 'foregroundColor'
>

/** First letter of whatever names the card, uppercased. */
export function iconMonogram(design: IconDesign, organizationName: string): string {
  const source =
    design.cardTitle?.trim() || design.programName.trim() || organizationName.trim() || 'S'
  return [...source][0]!.toUpperCase()
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function iconSvg(design: IconDesign, letter: string, size: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size * 0.22}" fill="${escapeXml(design.backgroundColor)}"/>
  <text x="50%" y="50%" dy="0.35em" text-anchor="middle"
        font-family="Helvetica, Arial, sans-serif" font-weight="600"
        font-size="${Math.round(size * 0.56)}" fill="${escapeXml(design.foregroundColor)}">${escapeXml(letter)}</text>
</svg>`
}

export async function renderFallbackIcon(
  design: IconDesign,
  organizationName: string,
  scale: '1x' | '2x' | '3x',
): Promise<Buffer> {
  const size = APPLE_ICON_SIZES[scale]
  const svg = iconSvg(design, iconMonogram(design, organizationName), size)
  return sharp(Buffer.from(svg, 'utf8')).png({ compressionLevel: 9 }).toBuffer()
}

export async function renderFallbackIconSet(
  design: IconDesign,
  organizationName: string,
): Promise<{ '1x': Buffer; '2x': Buffer; '3x': Buffer }> {
  const [one, two, three] = await Promise.all([
    renderFallbackIcon(design, organizationName, '1x'),
    renderFallbackIcon(design, organizationName, '2x'),
    renderFallbackIcon(design, organizationName, '3x'),
  ])
  return { '1x': one, '2x': two, '3x': three }
}
