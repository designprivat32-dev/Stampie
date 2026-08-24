/**
 * Schema-Abgleich beim Deploy — aber nur dort, wo die Datenbank auch dazugehört.
 *
 * Production und Preview zeigen bei der Neon-Vercel-Integration standardmäßig auf
 * *dieselbe* Datenbank. `prisma db push` aus einem Preview-Build heraus wendet damit das
 * Schema eines beliebigen Branches auf die Produktionsdatenbank an: ein älterer Branch
 * löscht Spalten, die auf `main` längst produktiv sind, und `seed.ts` schreibt obendrein
 * Demodaten hinein. Beides ist unumkehrbar und passiert ohne Rückfrage.
 *
 * Deshalb fasst nur der Production-Build das Schema an. Previews bauen gegen den Stand,
 * der bereits in der Datenbank steht.
 *
 * Sobald Previews eine eigene Datenbank haben (Neon: „Create a branch for each preview
 * deployment"), darf `PREVIEW_DB_IS_ISOLATED=1` gesetzt werden — dann pusht auch der
 * Preview-Build, weil er dabei nur seinen eigenen Branch verändert.
 *
 * Liegt kein VERCEL_ENV vor, läuft das Skript lokal: dann verhält es sich wie früher und
 * pusht, weil dort die Entwicklungsdatenbank gemeint ist.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

/**
 * Handgeschriebene Schritte, die vor dem Schema-Abgleich laufen müssen.
 *
 * `prisma db push` weigert sich, etwas zu verwerfen, ohne `--accept-data-loss` zu
 * verlangen — zu Recht. Wo ein Verwerfen tatsächlich gewollt ist, steht es hier als SQL,
 * begrenzt auf genau die betroffenen Objekte, statt das Flag pauschal zu setzen.
 *
 * Jede Datei ist idempotent und kann entfernt werden, sobald sie überall gelaufen ist.
 */
const PRE_PUSH_SQL = ['prisma/sql/001-drop-location.sql', 'prisma/sql/002-drop-card-archive.sql']

const env = process.env.VERCEL_ENV ?? 'development'
const isolatedPreview = process.env.PREVIEW_DB_IS_ISOLATED === '1'
const mayTouchDatabase = env === 'production' || env === 'development' || isolatedPreview

if (!mayTouchDatabase) {
  console.log(
    `[deploy] VERCEL_ENV=${env}: Schema-Push und Seed übersprungen. Diese Umgebung teilt ` +
      'sich die Datenbank mit Production. Details: prisma/deploy.mts',
  )
  process.exit(0)
}

for (const file of PRE_PUSH_SQL) {
  if (!existsSync(file)) continue
  console.log(`[deploy] ${file}`)
  run('npx', ['prisma', 'db', 'execute', '--file', file, '--schema', 'prisma/schema.prisma'])
}

run('npx', ['prisma', 'db', 'push', '--skip-generate'])
run('npx', ['tsx', 'prisma/seed.ts'])

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.status !== 0) {
    console.error(`[deploy] ${command} ${args.join(' ')} ist fehlgeschlagen.`)
    process.exit(result.status ?? 1)
  }
}
