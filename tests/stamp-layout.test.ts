import { describe, expect, it } from 'vitest'
import {
  APPLE_STRIP_CANVAS,
  GOOGLE_HERO_CANVAS,
  computeStampLayout,
} from '@/lib/cards/stamp-layout'

describe('computeStampLayout', () => {
  describe('one row whenever the stamps fit across', () => {
    it.each([
      [3, 1],
      [4, 1],
      [5, 1],
      [6, 1],
      [7, 2],
      [10, 2],
      [12, 2],
      [13, 2],
      [20, 2],
    ])('n=%i -> %i row(s)', (n, rows) => {
      expect(computeStampLayout(n).rows).toBe(rows)
    })

    it('uses one row exactly when the stamps fit across at their size', () => {
      const availableWidth =
        APPLE_STRIP_CANVAS.width - 2 * Math.round(APPLE_STRIP_CANVAS.width * 0.032)
      for (let n = 1; n <= 20; n++) {
        const l = computeStampLayout(n)
        expect(l.rows).toBe(n * l.cell <= availableWidth + 0.001 ? 1 : 2)
      }
    })

    it('horizontal slack spreads the stamps out, it does not enlarge them', () => {
      // Six in a row have width to spare; the stamp stays the size it had as two rows of 3.
      expect(computeStampLayout(6).icon).toBeCloseTo(computeStampLayout(10).icon, 5)
    })
  })

  describe('the documented reference grid (Apple strip 375x123)', () => {
    const cases: ReadonlyArray<[number, number, number, number, number]> = [
      // n, rows, cols, cell, icon
      [3, 1, 3, 63.96, 52.45],
      [5, 1, 5, 63.96, 52.45],
      [6, 1, 6, 51.5, 42.23],
      [10, 2, 5, 51.5, 42.23],
      [12, 2, 6, 51.5, 42.23],
      [20, 2, 10, 35.1, 28.78],
    ]

    it.each(cases)('n=%i', (n, rows, cols, cell, icon) => {
      const l = computeStampLayout(n)
      expect(l.rows).toBe(rows)
      expect(l.cols).toBe(cols)
      expect(l.cell).toBeCloseTo(cell, 1)
      expect(l.icon).toBeCloseTo(icon, 1)
      expect(l.cells).toHaveLength(n)
    })
  })

  it('sizes are driven by n, not hardcoded per tier: 20 stamps get smaller icons than 12', () => {
    expect(computeStampLayout(20).icon).toBeLessThan(computeStampLayout(12).icon)
    expect(computeStampLayout(12).icon).toBeLessThan(computeStampLayout(5).icon)
  })

  it('caps the cell size so a 3-stamp card does not get giant icons', () => {
    const three = computeStampLayout(3)
    expect(three.cell).toBeLessThanOrEqual(APPLE_STRIP_CANVAS.height * 0.52 + 0.001)
  })

  it.each([3, 5, 6, 7, 10, 11, 12, 13, 17, 20])('n=%i stays inside the canvas', (n) => {
    const l = computeStampLayout(n)
    for (const c of l.cells) {
      expect(c.x).toBeGreaterThanOrEqual(0)
      expect(c.y).toBeGreaterThanOrEqual(0)
      expect(c.x + c.size).toBeLessThanOrEqual(APPLE_STRIP_CANVAS.width)
      expect(c.y + c.size).toBeLessThanOrEqual(APPLE_STRIP_CANVAS.height)
    }
  })

  it.each([3, 5, 6, 10, 12, 20])('n=%i is horizontally centred', (n) => {
    const l = computeStampLayout(n)
    const first = l.cells[0]!
    const last = l.cells[l.cells.length - 1]!
    const leftMargin = first.x - l.gap / 2
    const rightMargin = APPLE_STRIP_CANVAS.width - (last.x + last.size + l.gap / 2)
    expect(leftMargin).toBeCloseTo(rightMargin, 5)
  })

  it('centres an incomplete last row (n=7 -> 4 + 3)', () => {
    const l = computeStampLayout(7)
    const top = l.cells.filter((c) => c.row === 0)
    const bottom = l.cells.filter((c) => c.row === 1)
    expect(top).toHaveLength(4)
    expect(bottom).toHaveLength(3)

    const topCentre = (top[0]!.x + top[top.length - 1]!.x + top[0]!.size) / 2
    const bottomCentre = (bottom[0]!.x + bottom[bottom.length - 1]!.x + bottom[0]!.size) / 2
    expect(topCentre).toBeCloseTo(bottomCentre, 5)
    expect(bottomCentre).toBeCloseTo(APPLE_STRIP_CANVAS.width / 2, 5)
  })

  it('centres an incomplete last row (n=11 -> 6 + 5)', () => {
    const l = computeStampLayout(11)
    expect(l.cells.filter((c) => c.row === 0)).toHaveLength(6)
    expect(l.cells.filter((c) => c.row === 1)).toHaveLength(5)
  })

  it('is vertically centred', () => {
    const l = computeStampLayout(10)
    const topEdge = Math.min(...l.cells.map((c) => c.y)) - l.gap / 2
    const bottomEdge =
      APPLE_STRIP_CANVAS.height - (Math.max(...l.cells.map((c) => c.y + c.size)) + l.gap / 2)
    expect(topEdge).toBeCloseTo(bottomEdge, 5)
  })

  it('keeps the same proportions on the Google 3:1 hero canvas', () => {
    const apple = computeStampLayout(10, APPLE_STRIP_CANVAS)
    const google = computeStampLayout(10, GOOGLE_HERO_CANVAS)
    expect(google.rows).toBe(apple.rows)
    expect(google.cols).toBe(apple.cols)
    expect(google.cell / GOOGLE_HERO_CANVAS.height).toBeCloseTo(
      apple.cell / APPLE_STRIP_CANVAS.height,
      2,
    )
  })

  it('clamps degenerate input instead of producing an empty grid', () => {
    expect(computeStampLayout(0).cells).toHaveLength(1)
    expect(computeStampLayout(-5).cells).toHaveLength(1)
    expect(computeStampLayout(7.9).cells).toHaveLength(7)
  })
})
