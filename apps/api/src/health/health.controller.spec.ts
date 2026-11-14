import { Health } from '@donovan/contracts';
import type { Client } from '@elastic/elasticsearch';
import type { Response } from 'express';
import type { Db } from '../db/db.module.js';
import { HealthController } from './health.controller.js';

const response = () => {
  const res = { statusCode: 200, status: vi.fn((code: number) => ((res.statusCode = code), res)) };
  return res as unknown as Response & { statusCode: number };
};

describe('HealthController', () => {
  it('is ready and ok when both stores answer', async () => {
    const db = { execute: vi.fn().mockResolvedValue([]) } as unknown as Db;
    const search = { ping: vi.fn().mockResolvedValue(true) } as unknown as Client;
    const res = response();
    const health = Health.parse(await new HealthController(db, search).get(res));
    expect(health).toMatchObject({ status: 'ok', checks: { postgres: 'up', elasticsearch: 'up' } });
    expect(res.statusCode).toBe(200);
  });

  it('is not ready (503) when Postgres is down', async () => {
    const db = { execute: vi.fn().mockRejectedValue(new Error('refused')) } as unknown as Db;
    const search = { ping: vi.fn().mockResolvedValue(true) } as unknown as Client;
    const res = response();
    expect(await new HealthController(db, search).get(res)).toMatchObject({
      status: 'degraded',
      checks: { postgres: 'down' },
    });
    expect(res.statusCode).toBe(503);
  });

  it('stays ready, degraded, when only search is down (search falls back to Postgres)', async () => {
    const db = { execute: vi.fn().mockResolvedValue([]) } as unknown as Db;
    const search = { ping: vi.fn().mockRejectedValue(new Error('refused')) } as unknown as Client;
    const res = response();
    expect(await new HealthController(db, search).get(res)).toMatchObject({ status: 'degraded' });
    expect(res.statusCode).toBe(200);
  });

  it("doesn't wait on a check that hangs", async () => {
    vi.useFakeTimers();
    const db = { execute: vi.fn(() => new Promise(() => undefined)) } as unknown as Db;
    const search = { ping: vi.fn().mockResolvedValue(true) } as unknown as Client;
    const res = response();
    const checked = new HealthController(db, search).get(res);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await checked).toMatchObject({ checks: { postgres: 'down' } });
    expect(res.statusCode).toBe(503);
    vi.useRealTimers();
  });
});
