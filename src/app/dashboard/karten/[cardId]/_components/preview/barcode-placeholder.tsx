'use client'

import type { CardDesignInput } from '@/lib/cards/schema'

/**
 * Static stand-in for the Apple previews — the real payload only exists once a pass is
 * issued, so the shape is drawn from the chosen format rather than from any data.
 */
export function BarcodePlaceholder({ format }: { format: CardDesignInput['barcodeFormat'] }) {
  if (format === 'CODE128') {
    return (
      <svg viewBox="0 0 100 40" className="h-[52px] w-[112px]" aria-hidden="true">
        {Array.from({ length: 34 }, (_, i) => (
          <rect key={i} x={i * 3} y={0} width={i % 3 === 0 ? 2 : 1} height={40} fill="black" />
        ))}
      </svg>
    )
  }
  if (format === 'PDF417') {
    return (
      <svg viewBox="0 0 100 40" className="h-[52px] w-[112px]" aria-hidden="true">
        {Array.from({ length: 8 }, (_, row) =>
          Array.from({ length: 40 }, (_, col) => (
            <rect
              key={`${row}-${col}`}
              x={col * 2.5}
              y={row * 5}
              width={(row * 7 + col * 3) % 4 === 0 ? 2 : 1}
              height={4}
              fill="black"
            />
          )),
        )}
      </svg>
    )
  }
  // QR and Aztec both read as a square matrix at this size.
  return (
    <svg viewBox="0 0 21 21" className="size-[104px]" aria-hidden="true">
      {QR_CELLS.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="black" />
      ))}
    </svg>
  )
}

/** Deterministic decorative matrix — finder patterns plus a fixed pseudo-random field. */
const QR_CELLS: ReadonlyArray<readonly [number, number]> = (() => {
  const cells: Array<[number, number]> = []
  const finder = (ox: number, oy: number) => {
    for (let x = 0; x < 7; x++) {
      for (let y = 0; y < 7; y++) {
        const edge = x === 0 || x === 6 || y === 0 || y === 6
        const core = x >= 2 && x <= 4 && y >= 2 && y <= 4
        if (edge || core) cells.push([ox + x, oy + y])
      }
    }
  }
  finder(0, 0)
  finder(14, 0)
  finder(0, 14)
  let seed = 7
  for (let x = 0; x < 21; x++) {
    for (let y = 0; y < 21; y++) {
      const inFinder = (x < 8 && y < 8) || (x > 12 && y < 8) || (x < 8 && y > 12)
      if (inFinder) continue
      seed = (seed * 1103515245 + 12345) % 2147483648
      if (seed % 100 < 46) cells.push([x, y])
    }
  }
  return cells
})()
