import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { RateLimitGuard, StreamLimiter } from './limits.js';

const config = (values: Record<string, number>) => ({ get: (k: string) => values[k] }) as unknown as ConfigService;

const context = (sub: string, path = '/api/chats') => {
  const headers: Record<string, string> = {};
  return {
    headers,
    ctx: {
      switchToHttp: () => ({
        getRequest: () => ({ path, ip: '10.0.0.1', claims: { sub } }),
        getResponse: () => ({ setHeader: (k: string, v: string) => (headers[k] = v) }),
      }),
    } as unknown as ExecutionContext,
  };
};

describe('RateLimitGuard', () => {
  it('lets a person make their budget of requests in a minute, then says when to retry', () => {
    const guard = new RateLimitGuard(config({ RATE_LIMIT_PER_MINUTE: 3 }));
    const a = context('alex');
    for (let i = 0; i < 3; i++) expect(guard.canActivate(a.ctx)).toBe(true);
    expect(() => guard.canActivate(a.ctx)).toThrow(/Too many requests/);
    expect(Number(a.headers['Retry-After'])).toBeGreaterThan(0);
    // Someone else has their own budget, and health checks aren't counted.
    expect(guard.canActivate(context('mara').ctx)).toBe(true);
    expect(guard.canActivate(context('alex', '/api/health').ctx)).toBe(true);
  });
});

describe('StreamLimiter', () => {
  it("refuses a stream over the person's limit until one ends", () => {
    const limiter = new StreamLimiter(config({ MAX_STREAMS_PER_USER: 2 }));
    const first = limiter.acquire('alex');
    limiter.acquire('alex');
    expect(() => limiter.acquire('alex')).toThrow(/already answering/);
    expect(() => limiter.acquire('mara')).not.toThrow();
    first();
    first(); // releasing twice frees one slot, not two
    expect(() => limiter.acquire('alex')).not.toThrow();
    expect(() => limiter.acquire('alex')).toThrow();
  });
});
