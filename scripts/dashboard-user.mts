/**
 * Sets the password for an operator dashboard account.
 *
 * The dashboard login checks `User.passwordHash`, and the operator accounts predate the
 * login — they have no password at all. This is how one gets set. It is also how you add
 * a new operator: pass an address that does not exist yet and the account is created.
 *
 *   npm run dashboard:user -- demo@stampie.de                 set a generated password
 *   npm run dashboard:user -- demo@stampie.de --show          …print the existing state first
 *   npm run dashboard:user -- demo@stampie.de --must-change   force a change on first sign-in
 *
 * To choose the password yourself, put it in STAMPIE_DASHBOARD_PASSWORD rather than on the
 * command line, so it does not end up in the shell history.
 *
 * Being on the `DASHBOARD_ADMIN_EMAILS` allowlist is what actually grants access; this
 * script only manages the credential and warns when the two disagree.
 *
 * Runs against DATABASE_URL_UNPOOLED (falling back to DATABASE_URL).
 */
import { randomBytes } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../src/lib/auth/password'
import { parseOperatorEmails } from '../src/lib/auth/operators'

const args = process.argv.slice(2)
const email = args.find((a) => !a.startsWith('--'))?.trim().toLowerCase()
const show = args.includes('--show')
const mustChange = args.includes('--must-change')

if (!email) {
  console.error('Aufruf: npm run dashboard:user -- <e-mail> [--show]')
  process.exit(1)
}

/** Readable password without easily-confused characters — same alphabet as the app logins. */
function randomPassword(length = 16): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  let out = ''
  for (const b of randomBytes(length)) out += alphabet[b % alphabet.length]
  return out
}

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL_UNPOOLED (oder DATABASE_URL) ist nicht gesetzt.')
  process.exit(1)
}

const prisma = new PrismaClient({ datasources: { db: { url } } })

try {
  const allowlist = parseOperatorEmails(process.env.DASHBOARD_ADMIN_EMAILS)
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, passwordHash: true },
  })

  if (show) {
    console.log(`Konto:      ${existing ? 'vorhanden' : 'wird angelegt'}`)
    console.log(`Passwort:   ${existing?.passwordHash ? 'gesetzt' : 'nicht gesetzt'}`)
    console.log(`Allowlist:  ${allowlist.length ? allowlist.join(', ') : '(leer)'}`)
    console.log('')
  }

  const password = process.env.STAMPIE_DASHBOARD_PASSWORD?.trim() || randomPassword()
  // Same floor as /api/app/change-password, so the two logins agree on what is acceptable.
  if (password.length < 8) {
    console.error('Das Passwort muss mindestens 8 Zeichen haben.')
    process.exit(1)
  }
  const passwordHash = await hashPassword(password)

  await prisma.user.upsert({
    where: { email },
    update: { passwordHash, mustChangePassword: mustChange },
    create: { email, name: 'Betreiber', passwordHash, mustChangePassword: mustChange },
  })

  console.log(`${existing ? 'Passwort gesetzt' : 'Konto angelegt'} für ${email}`)
  if (mustChange) console.log('Muss beim ersten Anmelden geändert werden.')
  if (!process.env.STAMPIE_DASHBOARD_PASSWORD) {
    console.log(`Passwort:  ${password}`)
    console.log('(wird nur einmal angezeigt — jetzt in den Passwortmanager)')
  }

  if (!allowlist.includes(email)) {
    console.log('')
    console.log('ACHTUNG: Diese Adresse steht nicht in DASHBOARD_ADMIN_EMAILS.')
    console.log('Ohne Eintrag dort kommt sie nicht ins Dashboard. Zu setzen ist:')
    console.log(`  DASHBOARD_ADMIN_EMAILS="${[...allowlist, email].join(',')}"`)
  }
} finally {
  await prisma.$disconnect()
}
