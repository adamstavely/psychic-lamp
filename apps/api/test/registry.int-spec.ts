import { RegistryCounts, RegistryItem, RegistrySummary } from '@donovan/contracts';
import { Client } from '@elastic/elasticsearch';
import { and, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { z } from 'zod';
import { DB, type Db } from '../src/db/db.module.js';
import { registryItems } from '../src/db/schema.js';
import { REGISTRY_INDEX } from '../src/registry/registry-search.js';
import { SearchBackfill } from '../src/search-api/search-backfill.js';
import { createTestApp, type TestApp } from './support/test-app.js';

describe('/api/registry', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  const bearer = { type: 'bearer' } as const;
  const list = async (token: string, query = '') =>
    z.array(RegistrySummary).parse((await http.get(`/api/registry${query}`).auth(token, bearer).expect(200)).body);
  beforeAll(async () => {
    t = await createTestApp();
    http = request(t.app.getHttpServer());
  });
  afterAll(() => t.app.close());

  it('starts with the catalog: every kind, counted for the rail', async () => {
    const token = await t.token();
    const counts = RegistryCounts.parse((await http.get('/api/registry/counts').auth(token, bearer).expect(200)).body);
    expect(counts).toMatchObject({ server: 6, agent: 4, model: 8, dataset: 4, space: 3, collection: 4, prompt: 5 });
    // Six skills: five published and one waiting for review, which everyone can see (anyone may review it).
    expect(counts.skill).toBeGreaterThanOrEqual(6);
    const skills = await list(token, '?kind=skill');
    expect(skills.find((s) => s.id === 'invoice')).toMatchObject({ status: 'pending' });
  });

  it("scopes to what's the person's, what teams own, or everything", async () => {
    const token = await t.token();
    expect(await list(token, '?scope=mine')).toEqual([]);
    const team = await list(token, '?scope=team&kind=agent');
    expect(team.map((a) => a.owner.team).sort()).toEqual(['Demand Science', 'Platform', 'Risk ML', 'Support AI']);
    expect((await list(token, '?scope=all')).length).toBeGreaterThanOrEqual(43);
    await http.get('/api/registry?scope=nobody').auth(token, bearer).expect(400);
  });

  it('opens an item with its details, and says so for one that is not there', async () => {
    const token = await t.token();
    const fs = RegistryItem.parse(
      (await http.get('/api/registry/server/filesystem').auth(token, bearer).expect(200)).body,
    );
    if (fs.kind !== 'server') throw new Error('not a server');
    expect(fs.details.tools.map((tool) => tool.name)).toEqual(['read_file', 'write_file', 'list_dir']);
    expect(fs.details.tools.find((tool) => tool.name === 'write_file')).toMatchObject({ write: true });
    await http.get('/api/registry/server/nope').auth(token, bearer).expect(404);
    await http.get('/api/registry/gadget/filesystem').auth(token, bearer).expect(400);
  });

  it('finds items by what is in them, and still does when search has not caught up', async () => {
    const token = await t.token();
    // A tool's name is in the server's details, not its name or summary.
    expect((await list(token, '?q=upsert_sku')).map((i) => `${i.kind}:${i.id}`)).toContain('server:pim');
    expect((await list(token, '?q=fraud&kind=model')).map((i) => i.id)).toContain('fraud');

    const es = t.app.get(Client);
    await es.delete({ index: REGISTRY_INDEX, id: 'dataset:sku-demand', refresh: true });
    expect((await list(token, '?q=sku-weekly-demand')).map((i) => i.id)).toContain('sku-demand');
    await t.app.get(SearchBackfill).run();
    expect(await es.exists({ index: REGISTRY_INDEX, id: 'dataset:sku-demand' })).toBe(true);
  });

  it("keeps someone's draft to themselves", async () => {
    const owner = await t.token();
    const other = await t.token();
    const me = (await http.get('/api/me').auth(owner, bearer).expect(200)).body as { id: string };
    await http.get('/api/me').auth(other, bearer).expect(200);
    const id = `draft-${randomUUID().slice(0, 8)}`;
    const db = t.app.get<Db>(DB);
    await db.insert(registryItems).values({
      kind: 'dataset',
      id,
      name: `Private draft ${id}`,
      slug: `me/${id}`,
      version: 'v0',
      sensitivity: 'Confidential',
      summary: 'Not ready',
      ownerTeam: null,
      ownerId: me.id,
      ownerName: 'Test Person',
      status: 'draft',
      details: {
        rows: '1',
        size: '1 KB',
        format: 'CSV',
        splits: '',
        usedBy: [],
        pulls: '0',
        updated: 'now',
        schema: [],
      },
    });
    try {
      expect((await list(owner, '?scope=mine')).map((i) => i.id)).toEqual([id]);
      await http.get(`/api/registry/dataset/${id}`).auth(owner, bearer).expect(200);
      await http.get(`/api/registry/dataset/${id}`).auth(other, bearer).expect(404);
      expect((await list(other, '?kind=dataset')).map((i) => i.id)).not.toContain(id);
      expect((await list(other, `?q=${id}`)).map((i) => i.id)).not.toContain(id);
    } finally {
      await db.delete(registryItems).where(and(eq(registryItems.kind, 'dataset'), eq(registryItems.id, id)));
    }
  });

  it('re-indexes an item whose search entry fell behind', async () => {
    const db = t.app.get<Db>(DB);
    const es = t.app.get(Client);
    const where = and(eq(registryItems.kind, 'space'), eq(registryItems.id, 'invoice-demo'));
    const [row] = await db
      .update(registryItems)
      .set({ searchVersion: sql`${registryItems.searchVersion} + 3` })
      .where(where)
      .returning();
    await t.app.get(SearchBackfill).run();
    const doc = await es.get<{ version: number }>({ index: REGISTRY_INDEX, id: 'space:invoice-demo' });
    expect(doc._source!.version).toBe(row!.searchVersion);
  });
});
