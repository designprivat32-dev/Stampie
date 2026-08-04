/**
 * Upload limits and shapes shared by the client and the server pipeline.
 *
 * Kept apart from `pipeline.ts` deliberately: that module is `server-only` (it pulls in
 * sharp and svgo), while the upload controls in the editor need the same numbers to give
 * immediate feedback before a byte leaves the browser.
 */

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

export const ACCEPTED_UPLOAD_MIME = 'image/png,image/jpeg,image/svg+xml'

export type AssetKind = 'LOGO' | 'SQUARE_LOGO' | 'ICON' | 'HERO' | 'STAMP_ICON'

export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

export interface KindSpec {
  readonly width: number
  readonly height: number
  /** `contain` keeps the whole logo visible; `cover` fills the frame (hero, icon). */
  readonly fit: 'contain' | 'cover'
  readonly scales: readonly (1 | 2 | 3)[]
}

/** Apple's documented asset sizes, plus our own hero/stamp-icon working sizes. */
export const KIND_SPECS: Record<AssetKind, KindSpec> = {
  // logo.png — max 160x50, must not be cropped.
  LOGO: { width: 160, height: 50, fit: 'contain', scales: [1, 2, 3] },
  // Google's programLogo: square, 660x660, cropped to a circle when displayed.
  SQUARE_LOGO: { width: 660, height: 660, fit: 'contain', scales: [1] },
  // icon.png — 29x29, mandatory, square.
  ICON: { width: 29, height: 29, fit: 'cover', scales: [1, 2, 3] },
  // Google heroImage / optional strip background, 3:1.
  HERO: { width: 1032, height: 336, fit: 'cover', scales: [1] },
  // Custom stamp icon: one square master, scaled down by the strip renderer.
  STAMP_ICON: { width: 128, height: 128, fit: 'contain', scales: [1] },
}
