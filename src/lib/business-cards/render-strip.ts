import sharp from 'sharp'
import { APPLE_STRIP_CANVAS } from '@/lib/cards/stamp-layout'
import type { ScaledPng } from '@/lib/pass/pass-builder'

/**
 * Das Bannerbild (`strip.png`) der Visitenkarte in Apple Wallet.
 *
 * Es füllt den oberen Teil der Karte; Wallet legt den Namen groß darüber, linksbündig.
 * Deshalb sitzt das Foto der Person rechts, rund ausgeschnitten, und links bleibt die
 * Kartenfarbe frei für die Schrift. Ohne Foto ist das Banner einfach die Kartenfarbe mit
 * einem leichten Verlauf — die Fläche ist trotzdem gefüllt, und der Name steht groß darin.
 *
 * Apples Maße für storeCard: 375×123 pt, geliefert als @1x/@2x/@3x.
 */

const HEX = /^#[0-9a-fA-F]{6}$/

function safeColor(value: string, fallback: string): string {
  return HEX.test(value) ? value : fallback
}

export interface BusinessStripInput {
  backgroundColor: string
  foregroundColor: string
  /** Foto der Person, beliebige Größe; wird rund und randlos eingepasst. */
  photoPng: Buffer | null
}

async function renderAt(input: BusinessStripInput, scale: 1 | 2 | 3): Promise<Buffer> {
  const width = APPLE_STRIP_CANVAS.width * scale
  const height = APPLE_STRIP_CANVAS.height * scale
  const bg = safeColor(input.backgroundColor, '#1a1a1a')
  const fg = safeColor(input.foregroundColor, '#ffffff')

  const base = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${fg}" stop-opacity="0.10"/>
      <stop offset="1" stop-color="${fg}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="${bg}"/>
  <rect width="${width}" height="${height}" fill="url(#g)"/>
</svg>`

  const layers: sharp.OverlayOptions[] = []
  if (input.photoPng) {
    const diameter = Math.round(height * 0.8)
    const inset = Math.round((height - diameter) / 2)
    const mask = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${diameter}" height="${diameter}"><circle cx="${diameter / 2}" cy="${diameter / 2}" r="${diameter / 2}" fill="#fff"/></svg>`,
    )
    const photo = await sharp(input.photoPng)
      .resize(diameter, diameter, { fit: 'cover' })
      .composite([{ input: mask, blend: 'dest-in' }])
      .png()
      .toBuffer()
    // Ein schmaler Ring in der Schriftfarbe hebt das Foto von der Kartenfarbe ab.
    const ring = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${diameter}" height="${diameter}"><circle cx="${diameter / 2}" cy="${diameter / 2}" r="${diameter / 2 - scale}" fill="none" stroke="${fg}" stroke-opacity="0.35" stroke-width="${2 * scale}"/></svg>`,
    )
    const left = width - diameter - inset * 2
    layers.push({ input: photo, top: inset, left }, { input: ring, top: inset, left })
  }

  return sharp(Buffer.from(base)).composite(layers).png({ compressionLevel: 9 }).toBuffer()
}

export async function renderBusinessStrip(input: BusinessStripInput): Promise<ScaledPng & { '2x': Buffer; '3x': Buffer }> {
  const [one, two, three] = await Promise.all([renderAt(input, 1), renderAt(input, 2), renderAt(input, 3)])
  return { '1x': one, '2x': two, '3x': three }
}
