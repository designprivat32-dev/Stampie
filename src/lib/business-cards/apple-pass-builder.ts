import 'server-only'
import { createHash } from 'node:crypto'
import { renderFallbackIconSet } from '@/lib/cards/render-icon'
import type { CardDesignInput } from '@/lib/cards/schema'
import { readAppleWalletCredentials, signManifest } from '@/lib/pass/apple-pass-builder'
import { applePassKitBaseUrl } from '@/lib/pass/apple-passkit-url'
import { readPassBuilderConfig, type PassBuilderConfig, type ScaledPng } from '@/lib/pass/pass-builder'
import { createZip, type ZipEntry } from '@/lib/pass/zip'
import { buildBusinessPassJson, fullName, type BusinessPassRole } from './apple-pass-json'
import type { BusinessCompany, BusinessContact } from './schema'

/**
 * Baut das .pkpass einer Visitenkarte.
 *
 * Gleicher Aufbau wie der Stempelkarten-Pass in `lib/pass/mock-pass-builder.ts` — Manifest
 * mit SHA-1 je Datei, Signatur sobald ein Zertifikat da ist —, aber ohne Stempelreihe.
 * Bewusst getrennt: der Stempel-Weg bleibt unberührt, und keine Bedingung dort muss
 * wissen, dass es Visitenkarten gibt.
 *
 * Frei von Datenbank und Speicher: Bilder kommen fertig herein, wie beim Stempel-Pass.
 */

export interface BusinessPassAssets {
  icon: ScaledPng | null
  logo: ScaledPng | null
  /** Foto der Person; wird `thumbnail.png`. */
  photo: ScaledPng | null
}

export interface BuildBusinessApplePassInput {
  design: CardDesignInput
  contact: BusinessContact
  company: BusinessCompany | null
  role: BusinessPassRole
  serial: string
  scanUrl: string
  privacyUrl: string
  assets: BusinessPassAssets
  /** Ohne Token kein `webServiceURL` — und damit keine Updates. */
  appleAuthToken?: string | null
  voided?: boolean
}

function pushScaled(files: ZipEntry[], base: string, image: ScaledPng | null): void {
  if (!image) return
  files.push({ name: `${base}.png`, data: image['1x'] })
  if (image['2x']) files.push({ name: `${base}@2x.png`, data: image['2x'] })
  if (image['3x']) files.push({ name: `${base}@3x.png`, data: image['3x'] })
}

export async function buildBusinessApplePass(
  input: BuildBusinessApplePassInput,
  config: PassBuilderConfig = readPassBuilderConfig(),
): Promise<Buffer> {
  const credentials = readAppleWalletCredentials()
  // Nur ein signierter Pass lässt sich aktualisieren — ohne Zertifikat gibt es keine
  // APNs-Identität, über die ein Update ankäme.
  const authenticationToken = credentials ? (input.appleAuthToken ?? null) : null

  const passJson = buildBusinessPassJson(input.design, input.contact, input.company, {
    role: input.role,
    serial: input.serial,
    passTypeIdentifier: config.passTypeIdentifier,
    teamIdentifier: config.teamIdentifier,
    scanUrl: input.scanUrl,
    privacyUrl: input.privacyUrl,
    voided: input.voided ?? false,
    webService: authenticationToken ? { url: applePassKitBaseUrl(), authenticationToken } : null,
  })

  const files: ZipEntry[] = [
    { name: 'pass.json', data: Buffer.from(JSON.stringify(passJson, null, 2), 'utf8') },
  ]

  // icon.png ist Pflicht; ohne hochgeladenes Icon ein Monogramm in den Kartenfarben.
  const icon =
    input.assets.icon ??
    (await renderFallbackIconSet(input.design, input.company?.company ?? fullName(input.contact)))
  pushScaled(files, 'icon', icon)
  pushScaled(files, 'logo', input.assets.logo)
  pushScaled(files, 'thumbnail', input.assets.photo)

  const manifest: Record<string, string> = {}
  for (const f of files) {
    manifest[f.name] = createHash('sha1').update(f.data).digest('hex')
  }
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8')
  files.push({ name: 'manifest.json', data: manifestBytes })

  if (credentials) {
    files.push({ name: 'signature', data: signManifest(manifestBytes, credentials) })
  }

  return createZip(files)
}
