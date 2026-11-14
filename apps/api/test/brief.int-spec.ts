import { Brief } from '@donovan/contracts';
import request from 'supertest';
import { createTestApp, type TestApp } from './support/test-app.js';

describe('/api/brief', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  const bearer = { type: 'bearer' } as const;
  beforeAll(async () => {
    t = await createTestApp();
    http = request(t.app.getHttpServer());
  });
  afterAll(() => t.app.close());

  it('starts with nothing done, read or seen', async () => {
    const token = await t.token();
    const brief = Brief.parse((await http.get('/api/brief?tz=Europe/London').auth(token, bearer).expect(200)).body);
    expect(brief.needs.every((n) => !n.done)).toBe(true);
    expect(brief.memos.every((m) => !m.read)).toBe(true);
    expect(brief.seenUpdates).toEqual([]);
  });

  it("keeps each person's marks to themselves", async () => {
    const alex = await t.token();
    const mara = await t.token();
    await http.put('/api/brief/needs/sku-run/done').auth(alex, bearer).send({ done: true }).expect(204);
    await http
      .post('/api/brief/memos/read')
      .auth(alex, bearer)
      .send({ ids: ['approval-tiers'] })
      .expect(204);
    await http
      .post('/api/brief/updates/seen')
      .auth(alex, bearer)
      .send({ ids: ['mara-1', 'mara-2'] })
      .expect(204);

    const mine = Brief.parse((await http.get('/api/brief').auth(alex, bearer).expect(200)).body);
    expect(mine.needs.find((n) => n.id === 'sku-run')!.done).toBe(true);
    expect(mine.memos.find((m) => m.id === 'approval-tiers')!.read).toBe(true);
    expect(mine.seenUpdates.sort()).toEqual(['mara-1', 'mara-2']);

    const theirs = Brief.parse((await http.get('/api/brief').auth(mara, bearer).expect(200)).body);
    expect(theirs.needs.find((n) => n.id === 'sku-run')!.done).toBe(false);
  });

  it('undoes a done need and an unread memo, and marking twice is harmless', async () => {
    const token = await t.token();
    await http.put('/api/brief/needs/rollout-note/done').auth(token, bearer).send({ done: true }).expect(204);
    await http.put('/api/brief/needs/rollout-note/done').auth(token, bearer).send({ done: true }).expect(204);
    await http.put('/api/brief/needs/rollout-note/done').auth(token, bearer).send({ done: false }).expect(204);
    await http
      .post('/api/brief/memos/read')
      .auth(token, bearer)
      .send({ ids: ['intents-draft-2'] })
      .expect(204);
    await http.delete('/api/brief/memos/intents-draft-2/read').auth(token, bearer).expect(204);

    const brief = Brief.parse((await http.get('/api/brief').auth(token, bearer).expect(200)).body);
    expect(brief.needs.find((n) => n.id === 'rollout-note')!.done).toBe(false);
    expect(brief.memos.find((m) => m.id === 'intents-draft-2')!.read).toBe(false);
  });

  it('rejects unknown items and bad input', async () => {
    const token = await t.token();
    await http.put('/api/brief/needs/nope/done').auth(token, bearer).send({ done: true }).expect(404);
    await http.post('/api/brief/memos/read').auth(token, bearer).send({ ids: [] }).expect(400);
    await http.get('/api/brief?tz=Mars/Olympus').auth(token, bearer).expect(400);
  });
});
