import request from 'supertest';
import { createTestApp, type TestApp } from './support/test-app.js';

describe('GET /api/health', () => {
  let t: TestApp;
  beforeAll(async () => (t = await createTestApp()));
  afterAll(() => t.app.close());

  it('answers without sign-in and sees both stores', async () => {
    const res = await request(t.app.getHttpServer()).get('/api/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', checks: { postgres: 'up', elasticsearch: 'up' } });
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

  it("doesn't exist unless ALLOW_TEST_RESET turns it on", async () => {
    await request(t.app.getHttpServer())
      .delete('/api/test/me')
      .auth(await t.token(), { type: 'bearer' })
      .expect(404);
  });
});
