import { describe, expect, it } from 'vitest';
import { Health } from './health.js';

const checks = { postgres: 'up', elasticsearch: 'up' } as const;

describe('Health', () => {
  it('accepts a known status', () => {
    expect(Health.parse({ status: 'ok', version: '0.0.0', checks }).status).toBe('ok');
  });

  it('rejects an unknown status', () => {
    expect(() => Health.parse({ status: 'up', version: '0.0.0', checks })).toThrow();
  });
});
