import 'server-only'
import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/db'
import { readPassBuilderConfig } from './pass-builder'

/**
 * The two pieces `pass.json` needs to make an installed pass update itself, and the check
 * that Apple's own calls against it have to pass.
 *
 * Touches the database, so the pass builder must not import it — see
 * `apple-passkit-url.ts` for why. Callers resolve the token and hand it to the builder.
 */

/**
 * The per-pass secret embedded as `authenticationToken`. Generated once, on first build,
 * and reused after — Apple's device sends back exactly what it was given, so changing it
 * later would just lock a pass out of its own updates.
 */
export async function ensureAppleAuthToken(serial: string): Promise<string | null> {
  const pass = await prisma.issuedPass.findFirst({
    where: { serial },
    select: { id: true, appleAuthToken: true },
  })
  if (!pass) return null
  if (pass.appleAuthToken) return pass.appleAuthToken

  const token = randomBytes(24).toString('base64url')
  await prisma.issuedPass.update({ where: { id: pass.id }, data: { appleAuthToken: token } })
  return token
}

/**
 * The bearer check every PassKit call carries except the log endpoint: `Authorization:
 * ApplePass <token>`, matched against the token baked into that exact pass. Wrong token,
 * unknown serial and a pass type identifier that is not ours all fail the same way — there
 * is nothing here worth telling a caller apart on.
 */
export async function verifyApplePassAuth(
  passTypeIdentifier: string,
  serialNumber: string,
  authorizationHeader: string | null,
): Promise<{ id: string; cardId: string } | null> {
  if (passTypeIdentifier !== readPassBuilderConfig().passTypeIdentifier) return null

  const token = authorizationHeader?.startsWith('ApplePass ')
    ? authorizationHeader.slice('ApplePass '.length)
    : null
  if (!token) return null

  return prisma.issuedPass.findFirst({
    where: { serial: serialNumber, appleAuthToken: token },
    select: { id: true, cardId: true },
  })
}
