import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import {
  renderHeroImage,
  renderStripImage,
  renderStripImageSet,
  type StripDesign,
} from '@/lib/cards/render-strip'
import { buildStripSvg } from '@/lib/cards/strip-svg'
import { APPLE_STRIP_CANVAS, GOOGLE_HERO_CANVAS } from '@/lib/cards/stamp-layout'
import { buildLogoSvg, renderLogoImage, WALLET_LOGO_SIZE } from '@/lib/cards/render-logo'
import { frameLogo } from '@/lib/images/logo-frame'

const design: StripDesign = {
  stampGoal: 10,
  foregroundColor: '#ffffff',
  backgroundColor: '#3b2418',
  stampIcon: 'coffee',
  emptyStampStyle: 'outline',
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

describe('renderStripImage', () => {
  it.each([
    [1, 375, 123],
    [2, 750, 246],
    [3, 1125, 369],
  ] as const)('Apple @%ix -> %ix%i', async (scale, width, height) => {
    const buf = await renderStripImage(design, 6, scale)
    expect(buf.subarray(0, 8)).toEqual(PNG_MAGIC)
    const meta = await sharp(buf).metadata()
    expect(meta.width).toBe(width)
    expect(meta.height).toBe(height)
    expect(meta.format).toBe('png')
  })

  it('renders the Google hero at 1032x336 (3:1)', async () => {
    const buf = await renderHeroImage(design, 6)
    const meta = await sharp(buf).metadata()
    expect(meta.width).toBe(GOOGLE_HERO_CANVAS.width)
    expect(meta.height).toBe(GOOGLE_HERO_CANVAS.height)
    // 1032/336 = 3.071 — Google's documented hero size, near enough to 3:1.
    expect(Math.abs(meta.width! / meta.height! - 3)).toBeLessThan(0.1)
  })

  it('ignores the scale for Google — the hero has one target size', async () => {
    const a = await renderStripImage(design, 6, 1, { target: 'google' })
    const b = await renderStripImage(design, 6, 3, { target: 'google' })
    expect(a.equals(b)).toBe(true)
  })

  it('renderStripImageSet always produces all three resolutions', async () => {
    const set = await renderStripImageSet(design, 4)
    const metas = await Promise.all([
      sharp(set['1x']).metadata(),
      sharp(set['2x']).metadata(),
      sharp(set['3x']).metadata(),
    ])
    expect(metas.map((m) => `${m.width}x${m.height}`)).toEqual(['375x123', '750x246', '1125x369'])
  })

  it('is deterministic — same input, same bytes', async () => {
    const [a, b] = await Promise.all([renderStripImage(design, 6, 2), renderStripImage(design, 6, 2)])
    expect(a.equals(b)).toBe(true)
  })

  it('produces different bytes for a different stamp count', async () => {
    const [a, b] = await Promise.all([renderStripImage(design, 3, 1), renderStripImage(design, 7, 1)])
    expect(a.equals(b)).toBe(false)
  })

  it.each([3, 5, 6, 10, 12, 20])('renders a valid PNG for n=%i', async (n) => {
    const buf = await renderStripImage({ ...design, stampGoal: n }, Math.floor(n / 2), 1)
    const meta = await sharp(buf).metadata()
    expect(meta.width).toBe(APPLE_STRIP_CANVAS.width)
  })

  it.each(['outline', 'transparent', 'dashed'] as const)('renders the %s empty style', async (style) => {
    const buf = await renderStripImage({ ...design, emptyStampStyle: style }, 4, 1)
    expect(buf.subarray(0, 8)).toEqual(PNG_MAGIC)
  })

  it('clamps currentStamps above the goal', async () => {
    const [full, over] = await Promise.all([
      renderStripImage(design, 10, 1),
      renderStripImage(design, 999, 1),
    ])
    expect(full.equals(over)).toBe(true)
  })

  it('clamps negative currentStamps to an empty card', async () => {
    const [empty, negative] = await Promise.all([
      renderStripImage(design, 0, 1),
      renderStripImage(design, -4, 1),
    ])
    expect(empty.equals(negative)).toBe(true)
  })
})

describe('buildStripSvg', () => {
  it('emits one node per stamp', () => {
    const svg = buildStripSvg(
      {
        stampGoal: 10,
        currentStamps: 6,
        foregroundColor: '#ffffff',
        backgroundColor: '#000000',
        stampIcon: 'coffee',
        emptyStampStyle: 'outline',
      },
      APPLE_STRIP_CANVAS,
    )
    expect(svg.match(/<path /g)).toHaveLength(6)
    expect(svg.match(/<circle /g)).toHaveLength(4)
  })

  it('renders open stamps at 25% opacity in transparent mode', () => {
    const svg = buildStripSvg(
      {
        stampGoal: 4,
        currentStamps: 1,
        foregroundColor: '#ffffff',
        backgroundColor: '#000000',
        stampIcon: 'star',
        emptyStampStyle: 'transparent',
      },
      APPLE_STRIP_CANVAS,
    )
    expect(svg.match(/opacity="0\.25"/g)).toHaveLength(3)
  })

  it('dashes open stamps in dashed mode', () => {
    const svg = buildStripSvg(
      {
        stampGoal: 4,
        currentStamps: 0,
        foregroundColor: '#ffffff',
        backgroundColor: '#000000',
        stampIcon: 'star',
        emptyStampStyle: 'dashed',
      },
      APPLE_STRIP_CANVAS,
    )
    expect(svg).toContain('stroke-dasharray')
  })

  it('falls back to safe colours instead of injecting unvalidated input', () => {
    const svg = buildStripSvg(
      {
        stampGoal: 3,
        currentStamps: 3,
        foregroundColor: '"><script>alert(1)</script>',
        backgroundColor: 'url(#evil)',
        stampIcon: 'star',
        emptyStampStyle: 'outline',
      },
      APPLE_STRIP_CANVAS,
    )
    expect(svg).not.toContain('script')
    expect(svg).not.toContain('evil')
    expect(svg).toContain('#ffffff')
    expect(svg).toContain('#1a1a1a')
  })

  it('sets pixel size from the scale but keeps the viewBox', () => {
    const svg = buildStripSvg(
      {
        stampGoal: 5,
        currentStamps: 5,
        foregroundColor: '#ffffff',
        backgroundColor: '#000000',
        stampIcon: 'star',
        emptyStampStyle: 'outline',
      },
      APPLE_STRIP_CANVAS,
      3,
    )
    expect(svg).toContain('width="1125" height="369"')
    expect(svg).toContain('viewBox="0 0 375 123"')
  })

  it('embeds a custom icon as a data URI instead of a path', () => {
    const svg = buildStripSvg(
      {
        stampGoal: 3,
        currentStamps: 3,
        foregroundColor: '#ffffff',
        backgroundColor: '#000000',
        stampIcon: 'custom',
        emptyStampStyle: 'outline',
        customIconBase64: 'AAAA',
      },
      APPLE_STRIP_CANVAS,
    )
    expect(svg.match(/<image /g)).toHaveLength(3)
    expect(svg).toContain('data:image/png;base64,AAAA')
  })
})

describe('renderLogoImage', () => {
  const logoDesign = {
    foregroundColor: '#fdf6ec',
    backgroundColor: '#3b2418',
    stampIcon: 'coffee',
  }

  it('renders a square PNG at Google\'s recommended size', async () => {
    const buf = await renderLogoImage(logoDesign)
    expect(buf.subarray(0, 8)).toEqual(PNG_MAGIC)
    const meta = await sharp(buf).metadata()
    expect(meta.width).toBe(WALLET_LOGO_SIZE)
    expect(meta.height).toBe(WALLET_LOGO_SIZE)
  })

  it('honours a custom size', async () => {
    const meta = await sharp(await renderLogoImage(logoDesign, 128)).metadata()
    expect(meta.width).toBe(128)
  })

  it('keeps the icon clear of the edges so circular cropping does not clip it', () => {
    const svg = buildLogoSvg(logoDesign, 100)
    // 52% box centred -> 24px inset on each side.
    expect(svg).toContain('translate(24 24)')
  })

  it('falls back to safe colours instead of injecting unvalidated input', () => {
    const svg = buildLogoSvg({ ...logoDesign, backgroundColor: '"><script>' }, 100)
    expect(svg).not.toContain('script')
    expect(svg).toContain('#1a1a1a')
  })

  it('is deterministic', async () => {
    const [a, b] = await Promise.all([renderLogoImage(logoDesign), renderLogoImage(logoDesign)])
    expect(a.equals(b)).toBe(true)
  })
})

describe('wallet logo framing', () => {
  const logoDesign = { foregroundColor: '#ffffff', backgroundColor: '#3b2418', stampIcon: 'coffee' }

  it('re-frames an uploaded Apple-shaped logo into a Google square', async () => {
    // Apple stores logos at 160x50; handed to Google unchanged it becomes a sliver in a
    // circular crop.
    const uploaded = await sharp({
      create: { width: 480, height: 150, channels: 4, background: '#ffffff' },
    })
      .png()
      .toBuffer()

    const meta = await sharp(await renderLogoImage(logoDesign, WALLET_LOGO_SIZE, uploaded)).metadata()
    expect(meta.width).toBe(WALLET_LOGO_SIZE)
    expect(meta.height).toBe(WALLET_LOGO_SIZE)
  })

  it('adopts the logo background so no square shows inside the circular crop', async () => {
    // A flat red sheet: the whole canvas should become red rather than leaving a red
    // square floating on the dark card colour.
    const uploaded = await sharp({
      create: { width: 400, height: 400, channels: 4, background: '#ff0000' },
    })
      .png()
      .toBuffer()

    const out = await renderLogoImage(logoDesign, 100, uploaded)
    const corner = await sharp(out).extract({ left: 0, top: 0, width: 4, height: 4 }).raw().toBuffer()
    expect(corner[0]).toBeGreaterThan(200)
    expect(corner[1]).toBeLessThan(60)
  })
})

describe('frameLogo', () => {
  /** A mark surrounded by a wide flat margin — how logo files actually look. */
  const withMargin = async (marginColour: string, alpha = 1) =>
    sharp({
      create: { width: 400, height: 400, channels: 4, background: { ...hexToRgb(marginColour), alpha } },
    })
      .composite([
        {
          input: await sharp({
            create: { width: 80, height: 80, channels: 4, background: '#111111' },
          })
            .png()
            .toBuffer(),
          gravity: 'centre',
        },
      ])
      .png()
      .toBuffer()

  it('trims the empty margin so the mark can fill the circle', async () => {
    const framed = await frameLogo(await withMargin('#f5f0e6'))
    const meta = await sharp(framed.image).metadata()
    // 400x400 down to roughly the 80x80 mark.
    expect(meta.width).toBeLessThan(120)
    expect(meta.height).toBeLessThan(120)
  })

  it('reports an opaque margin so the canvas can match it', async () => {
    const framed = await frameLogo(await withMargin('#f5f0e6'))
    expect(framed.backdrop).toBe('#f5f0e6')
  })

  it('reports null for a transparent margin', async () => {
    const framed = await frameLogo(await withMargin('#000000', 0))
    expect(framed.backdrop).toBeNull()
  })

  it('leaves artwork alone when the corners disagree', async () => {
    const gradient = await sharp({
      create: { width: 200, height: 200, channels: 4, background: '#ffffff' },
    })
      .composite([
        {
          input: await sharp({ create: { width: 100, height: 200, channels: 4, background: '#ff0000' } })
            .png()
            .toBuffer(),
          left: 0,
          top: 0,
        },
      ])
      .png()
      .toBuffer()

    const framed = await frameLogo(gradient)
    expect(framed.backdrop).toBeNull()
    expect((await sharp(framed.image).metadata()).width).toBe(200)
  })

  it('keeps the original when the image is nothing but margin', async () => {
    const blank = await sharp({
      create: { width: 200, height: 200, channels: 4, background: '#ffffff' },
    })
      .png()
      .toBuffer()
    expect((await sharp((await frameLogo(blank)).image).metadata()).width).toBe(200)
  })

  it('renders a filled logo: no bright square left inside the circle', async () => {
    const out = await renderLogoImage(
      { foregroundColor: '#ffffff', backgroundColor: '#3b2418', stampIcon: 'coffee' },
      200,
      await withMargin('#f5f0e6'),
    )
    // The canvas takes the margin colour, so the corner must not be the card colour.
    const corner = await sharp(out).extract({ left: 0, top: 0, width: 4, height: 4 }).raw().toBuffer()
    expect(corner[0]).toBeGreaterThan(200)
  })
})

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  }
}
