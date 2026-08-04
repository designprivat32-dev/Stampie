/**
 * File-type detection from the actual bytes. The extension and the browser-supplied MIME
 * type are attacker-controlled and are never consulted.
 */

export type DetectedImageType = 'png' | 'jpeg' | 'svg'

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff])

export function detectImageType(buffer: Buffer): DetectedImageType | null {
  if (buffer.length < 4) return null
  if (buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return 'png'
  if (buffer.subarray(0, 3).equals(JPEG_SIGNATURE)) return 'jpeg'
  if (looksLikeSvg(buffer)) return 'svg'
  return null
}

/**
 * SVG has no binary magic number, so we sniff the leading text. Only the first 1 KiB is
 * inspected: a file that needs more than that before its root element is not an SVG we
 * are willing to process.
 */
function looksLikeSvg(buffer: Buffer): boolean {
  const head = buffer.subarray(0, 1024).toString('utf8').trimStart()
  // Strip a BOM, an XML declaration and any leading comments/doctype.
  const withoutPrologue = head
    .replace(/^﻿/, '')
    .replace(/^<\?xml[^>]*\?>/i, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!DOCTYPE[^>]*>/i, '')
    .trimStart()
  return /^<svg[\s>]/i.test(withoutPrologue)
}

export const MIME_BY_TYPE: Record<DetectedImageType, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  svg: 'image/svg+xml',
}
