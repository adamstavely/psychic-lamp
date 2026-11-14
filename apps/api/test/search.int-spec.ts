import { ChatSummary, SearchResults } from '@donovan/contracts';
import { Client } from '@elastic/elasticsearch';
import { and, eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { DB, type Db } from '../src/db/db.module.js';
import { chats } from '../src/db/schema.js';
import { ChatsService } from '../src/chats/chats.service.js';
import { CHAT_INDEX } from '../src/search/chat-search.js';
import { SearchBackfill } from '../src/search-api/search-backfill.js';
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

describe('search reconciliation', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  const bearer = { type: 'bearer' } as const;
  beforeAll(async () => {
    t = await createTestApp();
    http = request(t.app.getHttpServer());
  });
  afterAll(() => t.app.close());

  it('repairs an entry that fell behind or went missing, and drops one for a deleted chat', async () => {
    const token = await t.token();
    const me = (await http.get('/api/me').auth(token, bearer).expect(200)).body as { id: string };
    const db = t.app.get<Db>(DB);
    const es = t.app.get(Client);
    const reconcile = t.app.get(SearchBackfill);
    const created = ChatSummary.parse(
      (await http.post('/api/chats').auth(token, bearer).send({ text: 'Quartzite supplier audit' }).expect(201)).body,
    );
    const docId = `${me.id}:${created.id}`;
    const version = async () =>
      ((await es.get<{ version?: number }>({ index: CHAT_INDEX, id: docId }))._source?.version ?? -1) as number;

    // An update whose indexing failed: the row moved on, the entry didn't.
    await db
      .update(chats)
      .set({ searchVersion: sql`${chats.searchVersion} + 5` })
      .where(and(eq(chats.ownerId, me.id), eq(chats.id, created.id)));
    const [row] = await db
      .select({ v: chats.searchVersion })
      .from(chats)
      .where(and(eq(chats.ownerId, me.id), eq(chats.id, created.id)));
    expect(await version()).toBeLessThan(row!.v);
    await reconcile.run();
    expect(await version()).toBe(row!.v);

    // An entry that's missing altogether: search still finds the chat by title meanwhile, from Postgres.
    await es.delete({ index: CHAT_INDEX, id: docId, refresh: true });
    const r = SearchResults.parse((await http.get('/api/search?q=Quartzite').auth(token, bearer).expect(200)).body);
    expect(r.chats.map((c) => c.id)).toContain(created.id);
    await reconcile.run();
    expect(await version()).toBe(row!.v);

    // A deleted chat's entry goes.
    await http.delete(`/api/chats/${created.id}`).auth(token, bearer).expect(204);
    await es.index({
      index: CHAT_INDEX,
      id: docId,
      document: { ownerId: me.id, id: created.id, title: 'x', text: '', version: 0 },
      refresh: true,
    });
    await reconcile.run();
    expect(await es.exists({ index: CHAT_INDEX, id: docId })).toBe(false);
  });

  it('never files old content under a newer version, when a change lands while it indexes', async () => {
    const token = await t.token();
    const me = (await http.get('/api/me').auth(token, bearer).expect(200)).body as { id: string };
    const db = t.app.get<Db>(DB);
    const es = t.app.get(Client);
    const created = ChatSummary.parse(
      (await http.post('/api/chats').auth(token, bearer).send({ text: 'Basalt quarry' }).expect(201)).body,
    );
    const where = and(eq(chats.ownerId, me.id), eq(chats.id, created.id));
    // Another change commits just after this re-index has read the chat's content.
    const service = t.app.get(ChatsService);
    const get = service.get.bind(service);
    vi.spyOn(service, 'get').mockImplementationOnce(async (...args) => {
      const chat = await get(...args);
      await db
        .update(chats)
        .set({ title: 'LATEST TITLE', searchVersion: sql`${chats.searchVersion} + 1` })
        .where(where);
      return chat;
    });
    await http.patch(`/api/chats/${created.id}`).auth(token, bearer).send({ title: 'OLDER TITLE' }).expect(200);
    vi.restoreAllMocks();

    const [row] = await db.select({ v: chats.searchVersion, title: chats.title }).from(chats).where(where);
    expect(row!.title).toBe('LATEST TITLE');
    const doc = (await es.get<{ title: string; version: number }>({ index: CHAT_INDEX, id: `${me.id}:${created.id}` }))
      ._source!;
    // The entry holds the older title, so it must be filed under an older version: that's what reconciliation repairs.
    expect(doc.title).toBe('OLDER TITLE');
    expect(doc.version).toBeLessThan(row!.v);
    await t.app.get(SearchBackfill).run();
    const repaired = (await es.get<{ title: string }>({ index: CHAT_INDEX, id: `${me.id}:${created.id}` }))._source!;
    expect(repaired.title).toBe('LATEST TITLE');
  });
});
