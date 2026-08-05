/**
 * Pure stamp-grid geometry. No sharp, no IO, no React — this is the piece that decides
 * what the card actually looks like, so it has to be trivially unit-testable.
 *
 * All values are in @1x layout units. Rasterisation multiplies the whole SVG by `scale`,
 * which is why @2x/@3x are guaranteed to be pixel-identical layouts, just sharper.
 */

export interface StripCanvas {
  readonly width: number
  readonly height: number
}

/** Apple `storeCard` strip, @1x. @2x = 750x246, @3x = 1125x369. */
export const APPLE_STRIP_CANVAS: StripCanvas = { width: 375, height: 123 }
/** Google Wallet heroImage, 3:1. Rendered at its target size, no @2x/@3x variants. */
export const GOOGLE_HERO_CANVAS: StripCanvas = { width: 1032, height: 336 }

const PAD_X_RATIO = 0.032
const PAD_Y_RATIO = 0.081
/** Keeps a 3-stamp card from rendering three enormous icons. */
const MAX_CELL_RATIO = 0.52
/** Share of a cell that is breathing room rather than icon. */
const GAP_RATIO = 0.18

export interface StampCell {
  readonly index: number
  /** Top-left of the icon box. */
  readonly x: number
  readonly y: number
  /** Width and height of the icon box (square). */
  readonly size: number
  readonly row: number
  readonly col: number
}

export interface StampLayout {
  readonly count: number
  readonly rows: number
  readonly cols: number
  /** Grid pitch: icon box plus gap. */
  readonly cell: number
  readonly gap: number
  /** Edge length of an icon box. */
  readonly icon: number
  readonly cells: readonly StampCell[]
  readonly canvas: StripCanvas
}

/**
 * Arranges `count` stamps inside `canvas`.
 *
 * Neither the row count nor the icon size is tiered: both fall out of one rule — take the
 * arrangement whose cells come out largest. On a 3:1 strip that puts up to 6 stamps in a
 * single row (a row of 6 is width-bound at a larger cell than two rows of 3, which are
 * height-bound), and everything above that into two rows, which is also why 13..20 end up
 * smaller than 7..12 without a second hardcoded rule.
 */
export function computeStampLayout(count: number, canvas: StripCanvas = APPLE_STRIP_CANVAS): StampLayout {
  const n = Math.max(1, Math.floor(count))

  const padX = Math.round(canvas.width * PAD_X_RATIO)
  const padY = Math.round(canvas.height * PAD_Y_RATIO)
  const availableWidth = canvas.width - 2 * padX
  const availableHeight = canvas.height - 2 * padY

  const cellFor = (rowCount: number) =>
    Math.min(
      availableWidth / Math.ceil(n / rowCount),
      availableHeight / rowCount,
      canvas.height * MAX_CELL_RATIO,
    )

  // Ties go to the single row: same size, fewer lines to read.
  const rows = cellFor(1) >= cellFor(2) ? 1 : 2
  const cols = Math.ceil(n / rows)

  const cell = cellFor(rows)
  const gap = cell * GAP_RATIO
  const icon = cell - gap

  const gridHeight = rows * cell
  const yStart = (canvas.height - gridHeight) / 2

  const cells: StampCell[] = []
  let index = 0
  for (let row = 0; row < rows; row++) {
    const remaining = n - index
    if (remaining <= 0) break
    // The last row is centred on its own, so an incomplete row sits under the middle
    // of the row above instead of being left-aligned.
    const inRow = Math.min(cols, remaining)
    const rowWidth = inRow * cell
    const xStart = (canvas.width - rowWidth) / 2
    for (let col = 0; col < inRow; col++) {
      cells.push({
        index,
        row,
        col,
        x: xStart + col * cell + gap / 2,
        y: yStart + row * cell + gap / 2,
        size: icon,
      })
      index++
    }
  }

  return { count: n, rows, cols, cell, gap, icon, cells, canvas }
}
