import { Health } from '@donovan/contracts';
import type { Client } from '@elastic/elasticsearch';
import type { Db } from '../db/db.module.js';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  it('is ok when both stores answer', async () => {
    const db = { execute: vi.fn().mockResolvedValue([]) } as unknown as Db;
    const search = { ping: vi.fn().mockResolvedValue(true) } as unknown as Client;
    const health = Health.parse(await new HealthController(db, search).get());
    expect(health).toMatchObject({ status: 'ok', checks: { postgres: 'up', elasticsearch: 'up' } });
  });

  it('is degraded when a store is down', async () => {
    const db = { execute: vi.fn().mockRejectedValue(new Error('refused')) } as unknown as Db;
    const search = { ping: vi.fn().mockResolvedValue(true) } as unknown as Client;
    expect(await new HealthController(db, search).get()).toMatchObject({
      status: 'degraded',
      checks: { postgres: 'down' },
    });
  });
});
