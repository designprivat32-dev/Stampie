import sharp from 'sharp'
import { APPLE_STRIP_CANVAS, GOOGLE_HERO_CANVAS, type StripCanvas } from './stamp-layout'
import { buildStripSvg, type StripSvgInput } from './strip-svg'
import type { CardDesignInput } from './schema'

/**
 * THE stamp renderer.
 *
 * Apple Wallet cannot render a dynamic grid — a .pkpass is static JSON plus static PNGs.
 * So the stamp row is generated server-side as a PNG and embedded as `strip.png`, freshly
 * on every stamp. The browser preview calls the same code through /api/preview/strip,
 * which is what guarantees preview and real card look identical.
 *
 * One renderer, one truth. There is deliberately no second implementation in React.
 */

export type StripTarget = 'apple' | 'google'
export type StripScale = 1 | 2 | 3

/** Everything the renderer needs — narrower than a full CardDesign so tests stay cheap. */
export type StripDesign = Pick<
  CardDesignInput,
  'stampGoal' | 'foregroundColor' | 'backgroundColor' | 'stampIcon' | 'emptyStampStyle'
>

export interface RenderStripOptions {
  target?: StripTarget
  /** PNG bytes for a custom or emoji stamp icon (design.stampIconAssetId / emoji sprite). */
  customIconPng?: Buffer | null
  /** PNG bytes for the optional background / hero image. */
  backgroundPng?: Buffer | null
}

export function canvasFor(target: StripTarget): StripCanvas {
  return target === 'google' ? GOOGLE_HERO_CANVAS : APPLE_STRIP_CANVAS
}

function toSvgInput(
  design: StripDesign,
  currentStamps: number,
  options: RenderStripOptions,
): StripSvgInput {
  return {
    stampGoal: design.stampGoal,
    currentStamps,
    foregroundColor: design.foregroundColor,
    backgroundColor: design.backgroundColor,
    stampIcon: design.stampIcon,
    emptyStampStyle: design.emptyStampStyle,
    customIconBase64: options.customIconPng ? options.customIconPng.toString('base64') : null,
    backgroundImageBase64: options.backgroundPng ? options.backgroundPng.toString('base64') : null,
  }
}

/**
 * Renders the stamp row.
 *
 * @param scale 1 | 2 | 3 — Apple needs all three in the pass bundle. Google's heroImage is
 *              rendered at its target size, so `scale` is ignored for `target: 'google'`.
 */
export async function renderStripImage(
  design: StripDesign,
  currentStamps: number,
  scale: StripScale,
  options: RenderStripOptions = {},
): Promise<Buffer> {
  const target = options.target ?? 'apple'
  const canvas = canvasFor(target)
  const effectiveScale = target === 'google' ? 1 : scale

  const svg = buildStripSvg(toSvgInput(design, currentStamps, options), canvas, effectiveScale)

  return sharp(Buffer.from(svg, 'utf8'))
    .png({ compressionLevel: 9, palette: false })
    .toBuffer()
}

export interface StripImageSet {
  '1x': Buffer
  '2x': Buffer
  '3x': Buffer
}

/** Apple pass bundles carry all three resolutions; always generate the full set. */
export async function renderStripImageSet(
  design: StripDesign,
  currentStamps: number,
  options: RenderStripOptions = {},
): Promise<StripImageSet> {
  const [one, two, three] = await Promise.all([
    renderStripImage(design, currentStamps, 1, options),
    renderStripImage(design, currentStamps, 2, options),
    renderStripImage(design, currentStamps, 3, options),
  ])
  return { '1x': one, '2x': two, '3x': three }
}

/** Google Wallet heroImage — same grid logic, 3:1 canvas. */
export async function renderHeroImage(
  design: StripDesign,
  currentStamps: number,
  options: Omit<RenderStripOptions, 'target'> = {},
): Promise<Buffer> {
  return renderStripImage(design, currentStamps, 1, { ...options, target: 'google' })
}
