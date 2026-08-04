/**
 * Dev-only visual check: renders the whole icon library through the real strip renderer.
 * Not part of the build. `npx tsx scripts/gen-preview.mts <outDir>`
 */
import sharp from 'sharp'
import { writeFileSync } from 'node:fs'
import { renderStripImage } from '../src/lib/cards/render-strip'
import { STAMP_ICONS } from '../src/lib/cards/stamp-icons'

const out = process.argv[2] ?? '.'

const tiles: Buffer[] = []
for (const icon of STAMP_ICONS) {
  tiles.push(
    await renderStripImage(
      {
        stampGoal: 6,
        foregroundColor: '#ffffff',
        backgroundColor: '#2b2b2b',
        stampIcon: icon.key,
        emptyStampStyle: 'outline',
      },
      4,
      1,
    ),
  )
}

const rows = Math.ceil(tiles.length / 2)
const composite = await sharp({
  create: {
    width: 375 * 2 + 8,
    height: 123 * rows + 8 * (rows - 1),
    channels: 3,
    background: '#888888',
  },
})
  .composite(
    tiles.map((input, i) => ({
      input,
      top: Math.floor(i / 2) * 131,
      left: (i % 2) * 383,
    })),
  )
  .png()
  .toBuffer()

writeFileSync(`${out}/icon-library.png`, composite)
console.log(`wrote ${out}/icon-library.png`)
