import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { detectImageType } from '@/lib/images/magic-bytes'
import { sanitizeSvg, UnsafeSvgError } from '@/lib/images/sanitize-svg'
import { processUpload, UploadValidationError } from '@/lib/images/pipeline'
import { KIND_SPECS, MAX_UPLOAD_BYTES } from '@/lib/images/upload-constraints'

const png = (width = 300, height = 200) =>
  sharp({
    create: { width, height, channels: 4, background: { r: 200, g: 40, b: 90, alpha: 1 } },
  })
    .png()
    .toBuffer()

const jpeg = () =>
  sharp({ create: { width: 200, height: 200, channels: 3, background: '#3366cc' } })
    .jpeg()
    .toBuffer()

describe('detectImageType', () => {
  it('detects PNG by magic bytes', async () => {
    expect(detectImageType(await png())).toBe('png')
  })

  it('detects JPEG by magic bytes', async () => {
    expect(detectImageType(await jpeg())).toBe('jpeg')
  })

  it.each([
    ['<svg xmlns="http://www.w3.org/2000/svg"></svg>'],
    ['<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>'],
    ['  \n<!-- a comment --><svg viewBox="0 0 1 1"></svg>'],
  ])('detects SVG (%#)', (svg) => {
    expect(detectImageType(Buffer.from(svg))).toBe('svg')
  })

  it('ignores the file name — JPEG bytes in a .png stay JPEG', async () => {
    // The extension is attacker-controlled; only the bytes are consulted.
    expect(detectImageType(await jpeg())).toBe('jpeg')
  })

  it.each([
    ['GIF89a....'],
    ['%PDF-1.4'],
    ['PK'],
    ['not an image at all'],
    [''],
  ])('rejects %s', (content) => {
    expect(detectImageType(Buffer.from(content))).toBeNull()
  })
})

describe('sanitizeSvg', () => {
  it('passes a plain SVG through', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>'
    expect(sanitizeSvg(Buffer.from(svg)).toString()).toContain('<svg')
  })

  it.each([
    ['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'script tag'],
    ['<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>', 'event handler'],
    ['<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)">x</a></svg>', 'javascript: url'],
    [
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><body xmlns="http://www.w3.org/1999/xhtml">x</body></foreignObject></svg>',
      'foreignObject',
    ],
    [
      '<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg">&xxe;</svg>',
      'XXE entity',
    ],
    [
      '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.example/pixel.png"/></svg>',
      'external image',
    ],
    [
      '<svg xmlns="http://www.w3.org/2000/svg"><use href="https://evil.example/x.svg#a"/></svg>',
      'external use',
    ],
  ])('rejects %s', (svg) => {
    expect(() => sanitizeSvg(Buffer.from(svg))).toThrow(UnsafeSvgError)
  })
})

describe('processUpload', () => {
  it('produces @1x/@2x/@3x for a logo at exactly 160x50 scaled', async () => {
    const result = await processUpload(await png(640, 200), 'LOGO')
    expect(result.variants.map((v) => `${v.width}x${v.height}`)).toEqual([
      '160x50',
      '320x100',
      '480x150',
    ])
    expect(result.sourceType).toBe('png')
  })

  it('produces a 29x29 icon set', async () => {
    const result = await processUpload(await png(500, 500), 'ICON')
    expect(result.variants.map((v) => `${v.width}x${v.height}`)).toEqual(['29x29', '58x58', '87x87'])
  })

  it('produces a single 3:1 hero', async () => {
    const result = await processUpload(await png(2000, 800), 'HERO')
    expect(result.variants).toHaveLength(1)
    expect(result.variants[0]).toMatchObject({ width: KIND_SPECS.HERO.width, height: KIND_SPECS.HERO.height })
  })

  it('always re-encodes to PNG, whatever came in', async () => {
    const result = await processUpload(await jpeg(), 'ICON')
    for (const variant of result.variants) {
      expect(variant.data.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    }
  })

  it('strips EXIF by decoding and re-encoding', async () => {
    const withExif = await sharp({
      create: { width: 120, height: 120, channels: 3, background: '#ff0000' },
    })
      .withMetadata({ exif: { IFD0: { Copyright: 'do-not-carry-me' } } })
      .jpeg()
      .toBuffer()

    const result = await processUpload(withExif, 'ICON')
    const meta = await sharp(result.variants[0]!.data).metadata()
    expect(meta.exif).toBeUndefined()
    expect(result.variants[0]!.data.includes('do-not-carry-me')).toBe(false)
  })

  it('applies a crop rectangle', async () => {
    const result = await processUpload(await png(400, 400), 'ICON', {
      crop: { x: 100, y: 100, width: 200, height: 200 },
    })
    expect(result.variants[0]!.width).toBe(29)
  })

  it('clamps a crop rectangle that reaches outside the image', async () => {
    const result = await processUpload(await png(100, 100), 'ICON', {
      crop: { x: 80, y: 80, width: 900, height: 900 },
    })
    expect(result.variants).toHaveLength(3)
  })

  it('rejects an oversized file', async () => {
    const big = Buffer.alloc(MAX_UPLOAD_BYTES + 1, 0)
    big.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
    await expect(processUpload(big, 'LOGO')).rejects.toThrow(UploadValidationError)
  })

  it('rejects an empty file', async () => {
    await expect(processUpload(Buffer.alloc(0), 'LOGO')).rejects.toThrow(UploadValidationError)
  })

  it('rejects a non-image', async () => {
    await expect(processUpload(Buffer.from('%PDF-1.4 hello'), 'LOGO')).rejects.toThrow(
      UploadValidationError,
    )
  })

  it('rejects a hostile SVG with a German message', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>x</script></svg>')
    await expect(processUpload(svg, 'LOGO')).rejects.toThrow(/nicht erlaubte Inhalte/)
  })

  it('rasterises a clean SVG', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#0af"/></svg>',
    )
    const result = await processUpload(svg, 'STAMP_ICON')
    const meta = await sharp(result.variants[0]!.data).metadata()
    expect(meta.format).toBe('png')
    expect(meta.width).toBe(128)
  })
})

describe('asset kinds stay in one place', () => {
  // A hand-maintained copy of this list in the upload action once rejected SQUARE_LOGO
  // with "Invalid enum value" while every other layer already accepted it.
  it('every kind in KIND_SPECS is processable', async () => {
    const source = await png(700, 700)
    for (const kind of Object.keys(KIND_SPECS) as Array<keyof typeof KIND_SPECS>) {
      const result = await processUpload(source, kind)
      expect(result.variants.length, `${kind} produced no variants`).toBeGreaterThan(0)
      expect(result.variants[0]!.width).toBe(KIND_SPECS[kind].width)
    }
  })

  it('covers the kinds the Prisma AssetKind enum declares', () => {
    expect(Object.keys(KIND_SPECS).sort()).toEqual(
      ['HERO', 'ICON', 'LOGO', 'SQUARE_LOGO', 'STAMP_ICON'].sort(),
    )
  })
})
