import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { type DependencyStatus, Health } from '@donovan/contracts';
import { Client } from '@elastic/elasticsearch';
import { Controller, Get, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Public } from '../auth/public.decorator.js';
import { DB, type Db } from '../db/db.module.js';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly search: Client,
  ) {}

  @Public()
  @Get()
  @ApiOkResponse({ standardSchema: Health })
  async get(): Promise<Health> {
    const [postgres, elasticsearch] = await Promise.all([
      status(() => this.db.execute(sql`select 1`)),
      status(() => this.search.ping()),
    ]);
    return {
      status: postgres === 'up' && elasticsearch === 'up' ? 'ok' : 'degraded',
      version: process.env['npm_package_version'] ?? '0.0.0',
      checks: { postgres, elasticsearch },
    };
  }
}

async function status(check: () => Promise<unknown>): Promise<DependencyStatus> {
  try {
    await check();
    return 'up';
  } catch {
    return 'down';
  }
}
