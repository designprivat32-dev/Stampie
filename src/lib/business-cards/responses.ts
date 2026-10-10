import { NextResponse } from 'next/server'
import { vCardFileName } from './vcard'
import type { BusinessContact } from './schema'

/** Antworten der öffentlichen Visitenkarten-Routen, an einer Stelle statt in jeder Route. */

export function pkpassResponse(bundle: Buffer, contact: BusinessContact): NextResponse {
  const name = vCardFileName(contact).replace(/\.vcf$/, '.pkpass')
  return new NextResponse(new Uint8Array(bundle), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.apple.pkpass',
      'Content-Length': String(bundle.length),
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
    },
  })
}

export function vCardResponse(vcard: string, contact: BusinessContact): NextResponse {
  const body = Buffer.from(vcard, 'utf8')
  return new NextResponse(new Uint8Array(body), {
    status: 200,
    headers: {
      'Content-Type': 'text/vcard; charset=utf-8',
      'Content-Length': String(body.length),
      'Content-Disposition': `attachment; filename="${vCardFileName(contact)}"`,
      'Cache-Control': 'no-store',
    },
  })
}

export function notFoundResponse(): NextResponse {
  return NextResponse.json({ error: 'Diese Visitenkarte gibt es nicht (mehr).' }, { status: 404 })
}

export function rateLimitedResponse(): NextResponse {
  return NextResponse.json(
    { error: 'Zu viele Anfragen von diesem Anschluss. Bitte später erneut versuchen.' },
    { status: 429 },
  )
}

/** Erste Adresse aus `x-forwarded-for` — auf Vercel die des Aufrufers. */
export function clientIp(headers: Headers): string {
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}
