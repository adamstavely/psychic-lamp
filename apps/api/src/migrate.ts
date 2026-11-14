import { runMigrations } from './db/migrate.js';

// The production migration job (npm run migrate): applies pending migrations and exits, before the API rolls out.
try {
  process.loadEnvFile('.env');
} catch {
  // No .env: the environment is set some other way.
}
const url = process.env['DATABASE_URL'];
if (!url) throw new Error('DATABASE_URL is not set');
await runMigrations(url);
console.log('Migrations applied.');
