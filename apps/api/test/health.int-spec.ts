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
});
