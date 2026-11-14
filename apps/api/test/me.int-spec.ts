import { DEFAULT_PREFERENCES, Me, Preferences } from '@donovan/contracts';
import request from 'supertest';
import { createTestApp, type TestApp } from './support/test-app.js';

describe('/api/me', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  beforeAll(async () => {
    t = await createTestApp();
    http = request(t.app.getHttpServer());
  });
  afterAll(() => t.app.close());

  it('needs a signed-in user', async () => {
    await http.get('/api/me').expect(401);
    await http.get('/api/me').set('Authorization', 'Bearer not-a-token').expect(401);
  });

  it('creates the person on first sign-in and keeps the same id after', async () => {
    const token = await t.token({ name: 'Alex Morgan', given_name: 'Alex', email: 'alex@example.com' });
    const first = Me.parse((await http.get('/api/me').auth(token, { type: 'bearer' }).expect(200)).body);
    const again = Me.parse((await http.get('/api/me').auth(token, { type: 'bearer' }).expect(200)).body);
    expect(first).toMatchObject({ name: 'Alex Morgan', firstName: 'Alex', initials: 'AM', email: 'alex@example.com' });
    expect(again.id).toBe(first.id);
  });

  it('starts preferences at the defaults and merges each change', async () => {
    const token = await t.token();
    const auth = { type: 'bearer' } as const;
    expect((await http.get('/api/me/preferences').auth(token, auth).expect(200)).body).toEqual(DEFAULT_PREFERENCES);

    await http.patch('/api/me/preferences').auth(token, auth).send({ theme: 'dark' }).expect(200);
    const res = await http.patch('/api/me/preferences').auth(token, auth).send({ railExpanded: false }).expect(200);
    expect(Preferences.parse(res.body)).toEqual({ ...DEFAULT_PREFERENCES, theme: 'dark', railExpanded: false });
  });

  it('rejects a preference it does not know', async () => {
    const token = await t.token();
    await http.patch('/api/me/preferences').auth(token, { type: 'bearer' }).send({ theme: 'blue' }).expect(400);
  });
});
