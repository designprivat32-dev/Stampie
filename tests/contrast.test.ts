import { describe, expect, it } from 'vitest'
import {
  autoFixForeground,
  contrastLevel,
  contrastRatio,
  evaluateContrast,
  readableOn,
  relativeLuminance,
} from '@/lib/color/contrast'
import { parseHex, toHex, toPassKitRgb, toGoogleHex } from '@/lib/color/convert'

describe('relativeLuminance', () => {
  it('matches the WCAG reference values', () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 6)
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 6)
    expect(relativeLuminance({ r: 255, g: 0, b: 0 })).toBeCloseTo(0.2126, 4)
  })
})

describe('contrastRatio', () => {
  it('black on white is 21:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
  })

  it('is symmetric', () => {
    expect(contrastRatio('#3c414c', '#ffffff')).toBeCloseTo(contrastRatio('#ffffff', '#3c414c'), 10)
  })

  it('identical colours are 1:1', () => {
    expect(contrastRatio('#8c1c13', '#8c1c13')).toBeCloseTo(1, 6)
  })

  it('known pair: #777777 on white', () => {
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 1)
  })

  it('the neon-pink-on-white case shop owners actually pick lands in the warn band', () => {
    const ratio = contrastRatio('#ff2fb9', '#ffffff')
    expect(ratio).toBeLessThan(4.5)
    expect(contrastLevel(ratio)).toBe('warn')
  })

  it('light grey on white is bad enough to block publishing', () => {
    expect(contrastLevel(contrastRatio('#cccccc', '#ffffff'))).toBe('block')
  })

  it('accepts short hex and missing #', () => {
    expect(contrastRatio('000', 'fff')).toBeCloseTo(21, 5)
  })

  it('returns the worst case for half-typed input instead of throwing', () => {
    expect(contrastRatio('#ff', '#ffffff')).toBe(1)
    expect(contrastRatio('', '')).toBe(1)
  })
})

describe('contrastLevel', () => {
  it.each([
    [21, 'ok'],
    [4.5, 'ok'],
    [4.49, 'warn'],
    [3, 'warn'],
    [2.99, 'block'],
    [1, 'block'],
  ] as const)('ratio %s -> %s', (ratio, level) => {
    expect(contrastLevel(ratio)).toBe(level)
  })

  it('evaluateContrast reports both numbers', () => {
    const r = evaluateContrast('#ffffff', '#1a1a1a')
    expect(r.level).toBe('ok')
    expect(r.ratio).toBeGreaterThan(15)
  })
})

describe('autoFixForeground', () => {
  it('leaves an already-compliant colour untouched', () => {
    expect(autoFixForeground('#ffffff', '#1a1a1a')).toBe('#ffffff')
  })

  it.each([
    ['#ff2fb9', '#ffffff'],
    ['#cccccc', '#ffffff'],
    ['#333333', '#000000'],
    ['#1f6f8b', '#0f2a4a'],
  ])('fixes %s on %s to at least 4.5:1', (fg, bg) => {
    const fixed = autoFixForeground(fg, bg)
    expect(contrastRatio(fixed, bg)).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps the hue of the brand colour', () => {
    const fixed = autoFixForeground('#ff2fb9', '#ffffff')
    const rgb = parseHex(fixed)!
    // still a pink/magenta: red and blue dominate green
    expect(rgb.r).toBeGreaterThan(rgb.g)
    expect(rgb.b).toBeGreaterThan(rgb.g)
  })

  it('falls back to an extreme when the hue cannot reach the target', () => {
    const fixed = autoFixForeground('#808080', '#808080', 21)
    expect(['#000000', '#ffffff']).toContain(fixed)
  })

  it('honours a custom target', () => {
    const fixed = autoFixForeground('#999999', '#ffffff', 7)
    expect(contrastRatio(fixed, '#ffffff')).toBeGreaterThanOrEqual(7)
  })
})

describe('readableOn', () => {
  it('picks white on dark and black on light', () => {
    expect(readableOn('#1a1a1a')).toBe('#ffffff')
    expect(readableOn('#f7efe1')).toBe('#000000')
  })
})

describe('colour conversion', () => {
  it('formats PassKit rgb() strings, not hex', () => {
    expect(toPassKitRgb('#3c414c')).toBe('rgb(60,65,76)')
    expect(toPassKitRgb('#FFFFFF')).toBe('rgb(255,255,255)')
  })

  it('formats Google hex, not rgb()', () => {
    expect(toGoogleHex('#3C414C')).toBe('#3c414c')
  })

  it('throws on invalid input rather than emitting a broken pass', () => {
    expect(() => toPassKitRgb('rot')).toThrow()
  })

  it('round-trips hex', () => {
    expect(toHex(parseHex('#8c1c13')!)).toBe('#8c1c13')
  })
})
