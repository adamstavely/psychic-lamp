import { describe, expect, it } from 'vitest';
import { Health } from './health.js';

describe('Health', () => {
  it('accepts a known status', () => {
    expect(Health.parse({ status: 'ok', version: '0.0.0' })).toEqual({ status: 'ok', version: '0.0.0' });
  });

  it('rejects an unknown status', () => {
    expect(() => Health.parse({ status: 'up', version: '0.0.0' })).toThrow();
  });
});
