import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { Env } from '../config/env.js';
import * as schema from './schema.js';

export type Db = NodePgDatabase<typeof schema>;
export const DB = Symbol('DB');
const POOL = Symbol('POOL');

@Global()
@Module({
  providers: [
    {
      provide: POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new pg.Pool({ connectionString: config.get('DATABASE_URL', { infer: true }) }),
    },
    { provide: DB, inject: [POOL], useFactory: (pool: pg.Pool): Db => drizzle(pool, { schema, casing: 'snake_case' }) },
  ],
  exports: [DB],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(POOL) private readonly pool: pg.Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
