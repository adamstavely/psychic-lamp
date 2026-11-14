import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.int-spec.ts'],
    // The suites share one database; run them one after another.
    fileParallelism: false,
    // The Docker Compose services (and CI's service containers) on their usual ports. Set here, not in the test helper:
    // ConfigModule validates the environment when app.module is imported, before any test code runs.
    env: {
      DATABASE_URL: process.env['DATABASE_URL'] ?? 'postgres://donovan:donovan@localhost:5433/donovan',
      ELASTICSEARCH_URL: process.env['ELASTICSEARCH_URL'] ?? 'http://localhost:9201',
      OIDC_ISSUER: process.env['OIDC_ISSUER'] ?? 'http://issuer.test/realms/donovan',
      OIDC_AUDIENCE: process.env['OIDC_AUDIENCE'] ?? 'donovan-api',
      STREAM_SPEED: '0',
      SEARCH_BACKFILL: 'false',
    },
  },
});
