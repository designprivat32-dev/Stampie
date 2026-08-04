export interface Rgb {
  r: number
  g: number
  b: number
}

export interface Hsl {
  h: number
  s: number
  l: number
}

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

/** Parses `#rgb` / `#rrggbb` (with or without `#`). Returns null on anything else. */
export function parseHex(hex: string): Rgb | null {
  const m = HEX_RE.exec(hex.trim())
  if (!m || !m[1]) return null
  const raw = m[1]
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  }
}

const clamp255 = (n: number): number => Math.max(0, Math.min(255, Math.round(n)))

export function toHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((c) => clamp255(c).toString(16).padStart(2, '0')).join('')}`
}

/**
 * PassKit wants colours as `rgb(60,65,76)` strings, not hex.
 * Throws on invalid input — the Zod schema guarantees valid hex before we get here.
 */
export function toPassKitRgb(hex: string): string {
  const rgb = parseHex(hex)
  if (!rgb) throw new Error(`Invalid hex colour: ${hex}`)
  return `rgb(${rgb.r},${rgb.g},${rgb.b})`
}

/** Google Wallet wants plain hex (`hexBackgroundColor`), lower-case with leading #. */
export function toGoogleHex(hex: string): string {
  const rgb = parseHex(hex)
  if (!rgb) throw new Error(`Invalid hex colour: ${hex}`)
  return toHex(rgb)
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l }
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
  else if (max === gn) h = ((bn - rn) / d + 2) / 6
  else h = ((rn - gn) / d + 4) / 6
  return { h, s, l }
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  if (s === 0) {
    const v = clamp255(l * 255)
    return { r: v, g: v, b: v }
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const channel = (t0: number): number => {
    let t = t0
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return {
    r: clamp255(channel(h + 1 / 3) * 255),
    g: clamp255(channel(h) * 255),
    b: clamp255(channel(h - 1 / 3) * 255),
  }
}
