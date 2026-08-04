/** Dev-only visual check for the wallet logo renderer. */
import { readFileSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'
import { renderLogoImage } from '../src/lib/cards/render-logo'

const [input, out, bg = '#f3d9de'] = process.argv.slice(2)
const logo = await renderLogoImage(
  { foregroundColor: '#111111', backgroundColor: bg, stampIcon: 'coffee' },
  660,
  readFileSync(input!),
)

// Mimic Google: a round container in the card colour with our square placed inside it.
const D = 760
const circle = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${D}" height="${D}"><circle cx="${D / 2}" cy="${D / 2}" r="${D / 2}" fill="${bg}"/></svg>`,
)
writeFileSync(
  out!,
  await sharp(circle).composite([{ input: logo, gravity: 'centre' }]).png().toBuffer(),
)
console.log('wrote', out)
