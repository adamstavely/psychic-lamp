import { ChatSummary, SearchResults } from '@donovan/contracts';
import request from 'supertest';
import { createTestApp, type TestApp } from './support/test-app.js';

describe('/api/search', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  const bearer = { type: 'bearer' } as const;
  beforeAll(async () => {
    t = await createTestApp();
    http = request(t.app.getHttpServer());
  });
  afterAll(() => t.app.close());

  it('finds chats by what was said in them, with the passage, on the very first request', async () => {
    const token = await t.token();
    const r = SearchResults.parse((await http.get('/api/search?q=3DS%20rollout').auth(token, bearer).expect(200)).body);
    expect(r.chats[0]).toMatchObject({ id: 'intents', title: 'Summarize support intents, Sept' });
    expect(r.chats[0]!.detail).toContain('3DS');
  });

  it('finds artifacts and projects too', async () => {
    const token = await t.token();
    const r = SearchResults.parse((await http.get('/api/search?q=rollout').auth(token, bearer).expect(200)).body);
    expect(r.artifacts.map((a) => a.title)).toContain('Rollout note — Fraud Sentinel v3.2');
    expect(r.projects.map((p) => p.title)).toEqual(['Fraud rollout']);
  });

  it('keeps search in step: new chats and renames are found, deleted ones are not', async () => {
    const token = await t.token();
    const made = ChatSummary.parse(
      (await http.post('/api/chats').auth(token, bearer).send({ text: 'Plan the zeppelin offsite' })).body,
    );
    await http
      .post(`/api/chats/${made.id}/messages`)
      .auth(token, bearer)
      .send({ text: 'Plan the zeppelin offsite' })
      .expect(200);
    expect(
      SearchResults.parse((await http.get('/api/search?q=zeppelin').auth(token, bearer)).body).chats.map((c) => c.id),
    ).toContain(made.id);
    await http.patch('/api/chats/churn').auth(token, bearer).send({ title: 'Churn bakeoff' }).expect(200);
    expect(
      SearchResults.parse((await http.get('/api/search?q=bakeoff').auth(token, bearer)).body).chats.map((c) => c.id),
    ).toEqual(['churn']);
    await http.delete('/api/chats/churn').auth(token, bearer).expect(204);
    expect(SearchResults.parse((await http.get('/api/search?q=bakeoff').auth(token, bearer)).body).chats).toEqual([]);
  });

  it('needs something to search for', async () => {
    const token = await t.token();
    await http.get('/api/search?q=').auth(token, bearer).expect(400);
  });
});

describe('search backfill', () => {
  let t: TestApp;
  beforeAll(async () => (t = await createTestApp()));
  afterAll(() => t.app.close());

  it("puts back chats search doesn't have", async () => {
    const { ChatSearch } = await import('../src/search/chat-search.js');
    const { SearchBackfill } = await import('../src/search-api/search-backfill.js');
    const http = request(t.app.getHttpServer());
    const token = await t.token({ sub: `backfill-${Date.now()}` });
    await http.get('/api/chats').auth(token, { type: 'bearer' }).expect(200);
    const me = (await http.get('/api/me').auth(token, { type: 'bearer' })).body as { id: string };
    await t.app.get(ChatSearch).removeOwner(me.id);
    expect((await http.get('/api/search?q=3DS%20rollout').auth(token, { type: 'bearer' })).body.chats).toEqual([]);
    await t.app.get(SearchBackfill).run();
    const found = (await http.get('/api/search?q=3DS%20rollout').auth(token, { type: 'bearer' })).body as {
      chats: { id: string }[];
    };
    expect(found.chats.map((c) => c.id)).toEqual(['intents']);
  });
});
