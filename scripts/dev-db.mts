/**
 * Local development database — PGlite over a real Postgres wire-protocol socket.
 *
 * This exists so the app can be run without installing PostgreSQL or Docker. PGlite is
 * actual Postgres compiled to WASM, so Prisma talks to it exactly as it would to a server;
 * `prisma db push`, migrations and every query in the app behave the same.
 *
 * Data lives in ./.pglite and survives restarts. For anything beyond local development,
 * use docker-compose.yml or a managed Postgres.
 *
 *   npx tsx scripts/dev-db.mts
 */
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'

const PORT = Number(process.env.DEV_DB_PORT ?? 5432)
const DATA_DIR = process.env.DEV_DB_DIR ?? './.pglite'

const db = await PGlite.create({ dataDir: DATA_DIR })
await db.waitReady

// Default is 1, which is not enough: Next dev, the Prisma pool and any prisma CLI
// command each hold their own connection. Queries are still serialised internally.
const server = new PGLiteSocketServer({
  db,
  port: PORT,
  host: '127.0.0.1',
  maxConnections: 20,
})
await server.start()

console.info(`PGlite listening on 127.0.0.1:${PORT} (data: ${DATA_DIR})`)
console.info('Stop with Ctrl+C.')

const shutdown = async () => {
  await server.stop()
  await db.close()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
