import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // `server-only` throws unless the bundler sets the react-server condition. In tests
      // we exercise these modules directly, so stub the marker out.
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    environmentMatchGlobs: [['tests/**/*.dom.test.{ts,tsx}', 'jsdom']],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/stores/**'],
      // Excluded because they cannot run without live infrastructure: everything below
      // needs either a PostgreSQL connection or an S3 bucket. They are covered by the
      // integration suite that runs against docker-compose, not by unit tests.
      exclude: [
        'src/lib/db.ts',
        'src/lib/auth/session.ts',
        'src/lib/cards/repository.ts',
        'src/lib/cards/asset-service.ts',
        'src/lib/cards/strip-service.ts',
        'src/lib/cards/test-card-service.ts',
        'src/lib/storage/index.ts',
        'src/lib/storage/s3-adapter.ts',
      ],
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },
    },
  },
})
