import { computeStampLayout, type StripCanvas, type StampLayout } from './stamp-layout'
import { resolveStampIcon } from './stamp-icons'
import { HEX_COLOR_RE, type EmptyStampStyle } from './schema'

/**
 * Turns a stamp layout into an SVG document. Kept separate from `render-strip.ts` so the
 * markup can be asserted in tests without going through sharp.
 *
 * Everything interpolated here is either a number computed by us or a hex colour that is
 * re-validated below — no user text ever reaches this markup.
 */

export interface StripSvgInput {
  readonly stampGoal: number
  readonly currentStamps: number
  readonly foregroundColor: string
  readonly backgroundColor: string
  readonly stampIcon: string
  readonly emptyStampStyle: EmptyStampStyle
  /** Base64 PNG (no data: prefix) for custom or emoji stamp icons. */
  readonly customIconBase64?: string | null
  /** Base64 PNG (no data: prefix) used as a full-bleed background. */
  readonly backgroundImageBase64?: string | null
}

const FALLBACK_FOREGROUND = '#ffffff'
const FALLBACK_BACKGROUND = '#1a1a1a'

function safeColor(value: string, fallback: string): string {
  return HEX_COLOR_RE.test(value) ? value.toLowerCase() : fallback
}

const OPEN_STAMP_OPACITY = 0.25

function renderFilledIcon(
  x: number,
  y: number,
  size: number,
  iconKey: string,
  color: string,
  opacity: number,
  customIconBase64: string | null | undefined,
): string {
  const o = opacity === 1 ? '' : ` opacity="${opacity}"`
  if (customIconBase64) {
    // Uploaded and emoji icons are pre-rasterised squares; they carry their own colours,
    // so the foreground colour does not apply to them.
    return `<image x="${round(x)}" y="${round(y)}" width="${round(size)}" height="${round(size)}" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${customIconBase64}"${o}/>`
  }
  const icon = resolveStampIcon(iconKey)
  const s = size / 24
  return `<path d="${icon.path}" fill="${color}" fill-rule="${icon.fillRule}" transform="translate(${round(x)} ${round(y)}) scale(${round(s, 4)})"${o}/>`
}

function renderOutlineStamp(
  x: number,
  y: number,
  size: number,
  color: string,
  dashed: boolean,
): string {
  const stroke = Math.max(1.5, size * 0.06)
  const r = size / 2 - stroke / 2
  const cx = x + size / 2
  const cy = y + size / 2
  const dash = dashed ? ` stroke-dasharray="${round(stroke * 2.2)} ${round(stroke * 1.6)}"` : ''
  return `<circle cx="${round(cx)}" cy="${round(cy)}" r="${round(r)}" fill="none" stroke="${color}" stroke-width="${round(stroke)}" stroke-linecap="round" opacity="0.55"${dash}/>`
}

function round(n: number, digits = 2): number {
  const f = 10 ** digits
  return Math.round(n * f) / f
}

export function buildStripSvg(input: StripSvgInput, canvas: StripCanvas, scale = 1): string {
  const foreground = safeColor(input.foregroundColor, FALLBACK_FOREGROUND)
  const background = safeColor(input.backgroundColor, FALLBACK_BACKGROUND)

  const goal = Math.max(1, Math.floor(input.stampGoal))
  const stamped = Math.max(0, Math.min(goal, Math.floor(input.currentStamps)))
  const layout: StampLayout = computeStampLayout(goal, canvas)

  const parts: string[] = []
  parts.push(`<rect width="${canvas.width}" height="${canvas.height}" fill="${background}"/>`)

  if (input.backgroundImageBase64) {
    parts.push(
      `<image x="0" y="0" width="${canvas.width}" height="${canvas.height}" preserveAspectRatio="xMidYMid slice" href="data:image/png;base64,${input.backgroundImageBase64}"/>`,
    )
    // Scrim so stamps stay readable on a photographic background.
    parts.push(`<rect width="${canvas.width}" height="${canvas.height}" fill="${background}" opacity="0.35"/>`)
  }

  for (const cell of layout.cells) {
    const isStamped = cell.index < stamped
    if (isStamped) {
      parts.push(
        renderFilledIcon(cell.x, cell.y, cell.size, input.stampIcon, foreground, 1, input.customIconBase64),
      )
      continue
    }
    switch (input.emptyStampStyle) {
      case 'outline':
        parts.push(renderOutlineStamp(cell.x, cell.y, cell.size, foreground, false))
        break
      case 'dashed':
        parts.push(renderOutlineStamp(cell.x, cell.y, cell.size, foreground, true))
        break
      case 'transparent':
        parts.push(
          renderFilledIcon(
            cell.x,
            cell.y,
            cell.size,
            input.stampIcon,
            foreground,
            OPEN_STAMP_OPACITY,
            input.customIconBase64,
          ),
        )
        break
    }
  }

  const pixelWidth = Math.round(canvas.width * scale)
  const pixelHeight = Math.round(canvas.height * scale)

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"`,
    ` width="${pixelWidth}" height="${pixelHeight}" viewBox="0 0 ${canvas.width} ${canvas.height}">`,
    parts.join(''),
    `</svg>`,
  ].join('')
}
