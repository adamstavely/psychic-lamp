import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { createTestApp, type TestApp } from './support/test-app.js';

describe('GET /api/health', () => {
  let t: TestApp;
  beforeAll(async () => (t = await createTestApp()));
  afterAll(() => t.app.close());

  it('answers without sign-in and sees both stores', async () => {
    const res = await request(t.app.getHttpServer()).get('/api/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', checks: { postgres: 'up', elasticsearch: 'up' } });
  });

  it('says the liveness probe is fine, and sends strict security headers', async () => {
    const res = await request(t.app.getHttpServer()).get('/api/health/live').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(res.headers).toMatchObject({
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
      'cache-control': 'no-store',
    });
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
  });

  it("gives every response a request id, keeping the caller's when it looks like one", async () => {
    const fresh = await request(t.app.getHttpServer()).get('/api/health').expect(200);
    expect(fresh.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    const given = await request(t.app.getHttpServer()).get('/api/health').set('x-request-id', 'edge-abc12345');
    expect(given.headers['x-request-id']).toBe('edge-abc12345');
    const odd = await request(t.app.getHttpServer()).get('/api/health').set('x-request-id', '<script>');
    expect(odd.headers['x-request-id']).not.toBe('<script>');
  });
});

describe('DELETE /api/test/me', () => {
  let t: TestApp;
  beforeAll(async () => (t = await createTestApp()));
  afterAll(() => t.app.close());

  it('refuses to start a production app that asks for it', () => {
    const production = {
      DONOVAN_ENV: 'production',
      DATABASE_URL: 'postgres://app:s3cret@db.internal:5432/donovan',
      ELASTICSEARCH_URL: 'https://search.internal:9200',
      ELASTICSEARCH_API_KEY: 'k',
      OIDC_ISSUER: 'https://sso.example.com/realms/pilot',
      MIGRATE_ON_START: 'false',
    };
    expect(() => AppModule.forEnvironment({ ...production, ALLOW_TEST_RESET: 'true' })).toThrow(/test reset/);
    expect(AppModule.forEnvironment(production).controllers).toEqual([]);
  });

  it("doesn't exist unless ALLOW_TEST_RESET turns it on", async () => {
    await request(t.app.getHttpServer())
      .delete('/api/test/me')
      .auth(await t.token(), { type: 'bearer' })
      .expect(404);
  });
});
