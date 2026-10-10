import sharp from 'sharp'
import type { ScaledPng } from '@/lib/pass/pass-builder'

/**
 * Das Bannerbild (`strip.png`) der Visitenkarte in Apple Wallet.
 *
 * Es füllt den oberen Teil der Karte; Wallet schreibt den Namen groß darüber, oben links,
 * und zwar über fast die ganze Breite. Das Foto sitzt deshalb **unten rechts**, unterhalb
 * der Namenszeile — rechts mittig lief ein langer Name ins Foto hinein (am iPhone gesehen).
 * Ohne Foto ist das Banner die Kartenfarbe mit einem leichten Verlauf.
 *
 * Maße: 375×144 pt. Store Cards zeigen das Banner in diesem Format; ein 375×123-Bild wird
 * von Wallet aufgezogen und an den Seiten abgeschnitten (ebenfalls am iPhone gesehen).
 */

export const BUSINESS_STRIP_CANVAS = { width: 375, height: 144 } as const

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
  const width = BUSINESS_STRIP_CANVAS.width * scale
  const height = BUSINESS_STRIP_CANVAS.height * scale
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
    // Unteres gutes Drittel bis zur Hälfte: der Name steht in der oberen Hälfte.
    const diameter = Math.round(height * 0.5)
    const inset = Math.round(height * 0.07)
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
    const left = width - diameter - Math.round(width * 0.045)
    const top = height - diameter - inset
    layers.push({ input: photo, top, left }, { input: ring, top, left })
  }

  return sharp(Buffer.from(base)).composite(layers).png({ compressionLevel: 9 }).toBuffer()
}

export async function renderBusinessStrip(input: BusinessStripInput): Promise<ScaledPng & { '2x': Buffer; '3x': Buffer }> {
  const [one, two, three] = await Promise.all([renderAt(input, 1), renderAt(input, 2), renderAt(input, 3)])
  return { '1x': one, '2x': two, '3x': three }
}
