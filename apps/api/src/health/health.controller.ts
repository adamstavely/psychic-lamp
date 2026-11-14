import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { type DependencyStatus, Health } from '@donovan/contracts';
import { Client } from '@elastic/elasticsearch';
import { Controller, Get, Inject, Res } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator.js';
import { DB, type Db } from '../db/db.module.js';

/** No check waits longer than this: a probe that hangs is a probe that fails. */
const CHECK_MS = 2_000;

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly search: Client,
  ) {}

  /**
   * Readiness: 200 when the instance can serve (Postgres is up), 503 when it can't. Search being down degrades it
   * (status "degraded") but doesn't take it out of rotation: chats and artifacts fall back to Postgres for search.
   */
  @Public()
  @Get()
  @ApiOkResponse({ standardSchema: Health })
  async get(@Res({ passthrough: true }) res: Response): Promise<Health> {
    const [postgres, elasticsearch] = await Promise.all([
      status(() => this.db.execute(sql`select 1`)),
      status(() => this.search.ping()),
    ]);
    if (postgres === 'down') res.status(503);
    return {
      status: postgres === 'up' && elasticsearch === 'up' ? 'ok' : 'degraded',
      version: process.env['npm_package_version'] ?? '0.0.0',
      checks: { postgres, elasticsearch },
    };
  }

  /** Liveness: the process is up and answering. It checks nothing else, so a store outage never restarts it. */
  @Public()
  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }
}

async function status(check: () => Promise<unknown>): Promise<DependencyStatus> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      check(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timed out')), CHECK_MS);
      }),
    ]);
    return 'up';
  } catch {
    return 'down';
  } finally {
    clearTimeout(timer);
  }
}
