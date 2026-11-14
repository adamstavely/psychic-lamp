import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.js';
import { runMigrations } from './db/migrate.js';
import { setUp } from './setup.js';

async function bootstrap() {
  // Read .env now (when there is one): AppModule.forEnvironment looks at the environment before ConfigModule loads it.
  try {
    process.loadEnvFile('.env');
  } catch {
    // No .env: the environment is set some other way.
  }
  const app = setUp(await NestFactory.create(AppModule.forEnvironment()));
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  // Locally the API migrates as it starts; production refuses that and runs `npm run migrate` as a job first.
  if (config.get('MIGRATE_ON_START', { infer: true })) await runMigrations(config.get('DATABASE_URL', { infer: true }));
  await app.listen(config.get('PORT', { infer: true }));
}
await bootstrap();
