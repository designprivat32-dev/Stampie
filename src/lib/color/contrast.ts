import { hslToRgb, parseHex, rgbToHsl, toHex, type Rgb } from './convert'

/**
 * WCAG 2.1 contrast maths. Deliberately hand-rolled: it is twenty lines, it has to be
 * unit-testable, and pulling in a colour library for it would be the larger liability.
 */

function channelLuminance(c8: number): number {
  const c = c8 / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

export function relativeLuminance(rgb: Rgb): number {
  return (
    0.2126 * channelLuminance(rgb.r) +
    0.7152 * channelLuminance(rgb.g) +
    0.0722 * channelLuminance(rgb.b)
  )
}

/**
 * Contrast ratio between two hex colours, 1..21.
 * Invalid input yields 1 (worst case) rather than throwing — this runs on every keystroke
 * in the colour picker, where a half-typed hex value is normal.
 */
export function contrastRatio(hexA: string, hexB: string): number {
  const a = parseHex(hexA)
  const b = parseHex(hexB)
  if (!a || !b) return 1
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

export type ContrastLevel = 'ok' | 'warn' | 'block'

export function contrastLevel(ratio: number): ContrastLevel {
  if (ratio < 3) return 'block'
  if (ratio < 4.5) return 'warn'
  return 'ok'
}

export interface ContrastReport {
  ratio: number
  level: ContrastLevel
}

export function evaluateContrast(foreground: string, background: string): ContrastReport {
  const ratio = contrastRatio(foreground, background)
  return { ratio, level: contrastLevel(ratio) }
}

/**
 * Nudges the foreground lightness until it clears `target` against the background,
 * keeping hue and saturation so the shop owner's brand colour survives the correction.
 * Falls back to black or white if the hue simply cannot reach the target.
 */
export function autoFixForeground(foregroundHex: string, backgroundHex: string, target = 4.5): string {
  const fg = parseHex(foregroundHex)
  const bg = parseHex(backgroundHex)
  if (!fg || !bg) return foregroundHex
  if (contrastRatio(foregroundHex, backgroundHex) >= target) return toHex(fg)

  const hsl = rgbToHsl(fg)
  const bgLum = relativeLuminance(bg)
  // Move away from the background: darken on a light background, lighten on a dark one.
  const directions: readonly number[] = bgLum > 0.35 ? [-1, 1] : [1, -1]

  for (const dir of directions) {
    for (let step = 1; step <= 100; step++) {
      const l = hsl.l + dir * step * 0.01
      if (l < 0 || l > 1) break
      const candidate = toHex(hslToRgb({ ...hsl, l }))
      if (contrastRatio(candidate, backgroundHex) >= target) return candidate
    }
  }
  // Nothing in this hue works — fall back to whichever extreme is further from the bg.
  return bgLum > 0.35 ? '#000000' : '#ffffff'
}

/** Picks the readable text colour for an arbitrary background (used for preview chrome). */
export function readableOn(backgroundHex: string): string {
  return contrastRatio('#ffffff', backgroundHex) >= contrastRatio('#000000', backgroundHex)
    ? '#ffffff'
    : '#000000'
}
