import 'server-only'
import { optimize } from 'svgo'

/**
 * SVG sanitising.
 *
 * An SVG is an executable document: it can carry <script>, event handlers, <foreignObject>
 * with arbitrary HTML, and external references that leak the viewer's IP. We do three
 * things, in this order:
 *
 *   1. reject anything on the deny list outright — a file that contains a script tag is
 *      not a logo, and silently stripping it hides an attack from the operator,
 *   2. run svgo to normalise the structure,
 *   3. re-check, because svgo is an optimiser and not a security boundary.
 *
 * The sanitised SVG is then rasterised by sharp and the original is discarded, so the
 * markup never reaches a browser. This function is the belt; rasterising is the braces.
 */

export class UnsafeSvgError extends Error {
  constructor(public readonly reason: string) {
    super(`Diese SVG-Datei enthält nicht erlaubte Inhalte (${reason}).`)
    this.name = 'UnsafeSvgError'
  }
}

const FORBIDDEN_ELEMENTS = [
  'script',
  'foreignObject',
  'iframe',
  'embed',
  'object',
  'audio',
  'video',
  'animate',
  'animateTransform',
  'set',
  'handler',
] as const

const FORBIDDEN_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/<\s*(script|foreignObject|iframe|embed|object|handler)\b/i, 'Script oder eingebetteter Inhalt'],
  [/\son\w+\s*=/i, 'Event-Handler-Attribut'],
  [/javascript\s*:/i, 'javascript:-URL'],
  [/data\s*:\s*text\/html/i, 'data:text/html-URL'],
  [/<!ENTITY/i, 'XML-Entity (XXE)'],
  [/<\s*use\b[^>]*\b(?:xlink:)?href\s*=\s*["']?\s*(?:https?:)?\/\//i, 'externe Referenz'],
  [/\burl\s*\(\s*["']?\s*(?:https?:)?\/\//i, 'externe Referenz'],
  [/<\s*image\b[^>]*\b(?:xlink:)?href\s*=\s*["']?\s*(?:https?:)?\/\//i, 'externes Bild'],
]

function assertSafe(svg: string): void {
  for (const [pattern, reason] of FORBIDDEN_PATTERNS) {
    if (pattern.test(svg)) throw new UnsafeSvgError(reason)
  }
}

export function sanitizeSvg(input: Buffer): Buffer {
  const raw = input.toString('utf8')
  assertSafe(raw)

  const result = optimize(raw, {
    multipass: true,
    plugins: [
      { name: 'preset-default' },
      {
        name: 'removeElementsByAttr',
        params: {},
      },
      { name: 'removeScriptElement' },
      { name: 'removeStyleElement' },
      { name: 'removeXMLProcInst' },
      { name: 'removeComments' },
      { name: 'removeMetadata' },
      { name: 'removeEditorsNSData' },
      {
        name: 'removeAttrs',
        params: { attrs: ['(on.*)', 'xlink:href.*http.*', 'href.*http.*'] },
      },
      {
        name: 'removeUnknownsAndDefaults',
        params: { unknownContent: true, unknownAttrs: true },
      },
    ],
  })

  const cleaned = result.data
  assertSafe(cleaned)
  for (const el of FORBIDDEN_ELEMENTS) {
    if (new RegExp(`<\\s*${el}\\b`, 'i').test(cleaned)) throw new UnsafeSvgError(el)
  }

  return Buffer.from(cleaned, 'utf8')
}
