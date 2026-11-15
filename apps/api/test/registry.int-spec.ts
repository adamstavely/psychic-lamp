import {
  AttachResult,
  RegistryInstall,
  SpaceRunResult,
  TryResult,
  RegistryCounts,
  RegistryItem,
  RegistrySummary,
} from '@donovan/contracts';
import { Client } from '@elastic/elasticsearch';
import { and, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { z } from 'zod';
import { DB, type Db } from '../src/db/db.module.js';
import { registryItems } from '../src/db/schema.js';
import { REGISTRY_INDEX } from '../src/registry/registry-search.js';
import { RegistryService } from '../src/registry/registry.service.js';
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
    expect(counts).toMatchObject({ server: 6, agent: 4, model: 9, dataset: 4, space: 3, collection: 4, prompt: 5 });
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
    expect((await list(token, '?scope=all')).length).toBeGreaterThanOrEqual(44);
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

  it("tries a server's tool in the sandbox: a mock result, and the required arguments asked for", async () => {
    const token = await t.token();
    const tryIt = (tool: string, args: Record<string, string>) =>
      http.post(`/api/registry/server/filesystem/tools/${tool}/try`).auth(token, bearer).send({ args });
    const ran = TryResult.parse((await tryIt('read_file', { path: 'notes/plan.md' }).expect(200)).body);
    expect(ran.status).toBe('200 OK');
    expect(JSON.parse(ran.result)).toMatchObject({ path: 'notes/plan.md' });
    expect((await tryIt('read_file', {}).expect(400)).body.message).toBe('Fill in path');
    await tryIt('delete_everything', {}).expect(404);
    await http.post('/api/registry/server/nope/tools/read_file/try').auth(token, bearer).send({ args: {} }).expect(404);
  });

  it('records installs per person and client, once each, and takes one out', async () => {
    const token = await t.token({ sub: `installer-${randomUUID()}` });
    const other = await t.token({ sub: 'installer-other' });
    const url = '/api/registry/server/filesystem/installs';
    const clients = (body: unknown) =>
      z
        .array(RegistryInstall)
        .parse(body)
        .map((i) => i.client);
    expect(clients((await http.get(url).auth(token, bearer).expect(200)).body)).toEqual([]);
    await http.post(url).auth(token, bearer).send({ client: 'cursor' }).expect(200);
    await http.post(url).auth(token, bearer).send({ client: 'cursor' }).expect(200);
    const both = await http.post(url).auth(token, bearer).send({ client: 'claude-code' }).expect(200);
    expect(clients(both.body)).toEqual(['cursor', 'claude-code']);
    expect(clients((await http.get(url).auth(other, bearer).expect(200)).body)).toEqual([]);
    await http.post(url).auth(token, bearer).send({ client: 'emacs' }).expect(400);
    await http.post('/api/registry/agent/release/installs').auth(token, bearer).send({ client: 'cursor' }).expect(400);
    const left = await http.delete(`${url}/cursor`).auth(token, bearer).expect(200);
    expect(clients(left.body)).toEqual(['claude-code']);
  });

  it("runs a space on what it's given, and asks for something to run on", async () => {
    const token = await t.token();
    const run = (input: string) =>
      http.post('/api/registry/space/fraud-explainer/run').auth(token, bearer).send({ input });
    const ran = SpaceRunResult.parse((await run('{"amount": 1249}').expect(200)).body);
    expect(ran.outputs[0]).toEqual({ label: 'Score', value: '0.971' });
    await run('   ').expect(400);
    await http.post('/api/registry/space/nope/run').auth(token, bearer).send({ input: 'x' }).expect(404);
  });

  it("attaches a collection to the person's project, raising the project to the collection's tier", async () => {
    const token = await t.token({ sub: 'collector' });
    const other = await t.token({ sub: 'collector-other' });
    const project = (
      await http
        .post('/api/projects')
        .auth(token, bearer)
        .send({ name: 'Fraud review', sensitivity: 'Internal' })
        .expect(201)
    ).body as { id: string };
    const url = '/api/registry/collection/risk-fraud/projects';

    const first = AttachResult.parse(
      (await http.post(url).auth(token, bearer).send({ projectId: project.id }).expect(200)).body,
    );
    expect(first.attachments.map((a) => a.project)).toEqual(['Fraud review']);
    expect(first.raised).toEqual({ from: 'Internal', to: 'Restricted' });
    const again = AttachResult.parse(
      (await http.post(url).auth(token, bearer).send({ projectId: project.id }).expect(200)).body,
    );
    expect(again.raised).toBeNull();
    const after = (await http.get(`/api/projects/${project.id}`).auth(token, bearer).expect(200)).body as {
      sensitivity: string;
    };
    expect(after.sensitivity).toBe('Restricted');

    await http.post(url).auth(other, bearer).send({ projectId: project.id }).expect(400);
    expect((await http.get(url).auth(other, bearer).expect(200)).body).toEqual([]);
    expect((await http.delete(`${url}/${project.id}`).auth(token, bearer).expect(200)).body).toEqual([]);
  });

  describe('registering', () => {
    // Submissions are visible to everyone while pending, so they'd change the catalog counts above on the next run.
    afterAll(async () => {
      const db = t.app.get<Db>(DB);
      await db
        .delete(registryItems)
        .where(sql`${registryItems.ownerId} in (select id from users where subject like 'registrar-%')`);
    });
    const access = { readOnly: true, approval: true, internalOnly: false, audit: true };
    const server = (name: string) => ({
      kind: 'server',
      name,
      summary: 'Reads tickets.',
      team: null,
      sensitivity: 'Internal',
      access,
      transport: 'HTTP',
      auth: 'OAuth 2.1',
      endpoint: 'https://mcp.example.com/sse',
    });

    it("saves a submission as pending, the person's own, and lists it in their Mine", async () => {
      const sub = `registrar-${randomUUID()}`;
      const token = await t.token({ sub, name: 'Robin Reyes' });
      const name = `Ticket reader ${sub.slice(-6)}`;
      const made = RegistryItem.parse(
        (await http.post('/api/registry').auth(token, bearer).send(server(name)).expect(201)).body,
      );
      expect(made).toMatchObject({
        kind: 'server',
        status: 'pending',
        version: 'v1',
        slug: expect.stringMatching(/^robin-reyes\/ticket-reader-/),
        owner: { team: null, name: 'Robin Reyes' },
        access,
        details: { verified: false, transport: 'HTTP', tools: [] },
      });
      expect((await list(token, '?scope=mine')).map((i) => [i.id, i.status])).toEqual([[made.id, 'pending']]);
      await http.post('/api/registry').auth(token, bearer).send(server(name)).expect(409);
      await http
        .post('/api/registry')
        .auth(token, bearer)
        .send({ ...server(''), name: '  ' })
        .expect(400);
    });

    it('refuses an agent with no servers or skills', async () => {
      const token = await t.token({ sub: `registrar-${randomUUID()}` });
      const res = await http
        .post('/api/registry')
        .auth(token, bearer)
        .send({
          kind: 'agent',
          name: `Empty agent ${randomUUID().slice(0, 6)}`,
          summary: 'Does nothing.',
          team: null,
          sensitivity: 'Internal',
          access,
          model: 'claude-sonnet-4.5',
          autonomy: 'Read-only',
          servers: [],
          skills: [],
        })
        .expect(400);
      expect(res.body.message).toMatch(/at least one server or skill/);
    });

    it("raises a collection to its most sensitive member, and refuses members the registry doesn't have", async () => {
      const token = await t.token({ sub: `registrar-${randomUUID()}` });
      const collection = (members: { kind: string; id: string }[]) => ({
        kind: 'collection',
        name: `Bundle ${randomUUID().slice(0, 6)}`,
        summary: 'Two things.',
        team: 'Risk ML',
        sensitivity: 'Public',
        access,
        members,
      });
      const made = RegistryItem.parse(
        (
          await http
            .post('/api/registry')
            .auth(token, bearer)
            .send(
              collection([
                { kind: 'server', id: 'filesystem' },
                { kind: 'dataset', id: 'txn-graph' },
              ]),
            )
            .expect(201)
        ).body,
      );
      expect(made).toMatchObject({ sensitivity: 'Restricted', owner: { team: 'Risk ML' } });
      expect(made.details).toEqual({
        members: [
          { kind: 'server', id: 'filesystem', name: 'Filesystem' },
          { kind: 'dataset', id: 'txn-graph', name: 'Transaction graph 2026-Q3' },
        ],
      });
      const missing = await http
        .post('/api/registry')
        .auth(token, bearer)
        .send(
          collection([
            { kind: 'server', id: 'filesystem' },
            { kind: 'server', id: 'nope' },
          ]),
        )
        .expect(400);
      expect(missing.body.message).toBe('Not in the registry: server nope');
      // An id of another kind is not the item: "churn" is a skill and a model, never a server.
      const wrongKind = await http
        .post('/api/registry')
        .auth(token, bearer)
        .send(
          collection([
            { kind: 'server', id: 'filesystem' },
            { kind: 'server', id: 'churn' },
          ]),
        )
        .expect(400);
      expect(wrongKind.body.message).toBe('Not in the registry: server churn');
    });

    it("links an agent to its servers and skills by id, keeping each one's name", async () => {
      const token = await t.token({ sub: `registrar-${randomUUID()}` });
      const made = RegistryItem.parse(
        (
          await http
            .post('/api/registry')
            .auth(token, bearer)
            .send({
              kind: 'agent',
              name: `Linked agent ${randomUUID().slice(0, 6)}`,
              summary: 'Reads the repo.',
              team: null,
              sensitivity: 'Internal',
              access,
              model: 'claude-sonnet-4.5',
              autonomy: 'Read-only',
              servers: ['github'],
              skills: ['pr', 'notes'],
            })
            .expect(201)
        ).body,
      );
      expect(made.kind === 'agent' && made.details).toMatchObject({
        servers: [{ id: 'github', name: 'GitHub' }],
        skills: [
          { id: 'pr', name: 'PR review checklist' },
          { id: 'notes', name: 'Release notes' },
        ],
      });
    });

    it('turns links stored by name, as earlier registries kept them, into links by id on start', async () => {
      const db = t.app.get<Db>(DB);
      const id = `named-${randomUUID().slice(0, 8)}`;
      await db.insert(registryItems).values({
        kind: 'collection',
        id,
        name: `Named ${id}`,
        slug: `test/${id}`,
        version: 'v1',
        sensitivity: 'Restricted',
        summary: 'Linked by name.',
        ownerTeam: 'Test',
        ownerId: null,
        ownerName: 'Test',
        status: 'published',
        details: {
          members: [
            { kind: 'model', name: 'Fraud Sentinel v3.2' },
            { kind: 'model', name: 'Price Elasticity' },
            { kind: 'skill', name: 'Rollout note' },
          ],
        } as never,
      });
      try {
        await t.app.get(RegistryService).onApplicationBootstrap();
        const [row] = await db
          .select({ details: registryItems.details })
          .from(registryItems)
          .where(and(eq(registryItems.kind, 'collection'), eq(registryItems.id, id)));
        expect(row!.details).toEqual({
          members: [
            { kind: 'model', id: 'fraud', name: 'Fraud Sentinel' },
            { kind: 'skill', id: 'rollout', name: 'Rollout note' },
          ],
        });
      } finally {
        await db.delete(registryItems).where(and(eq(registryItems.kind, 'collection'), eq(registryItems.id, id)));
      }
    });

    it("reads a skill's principles from its SKILL.md, and keeps the SKILL.md as it was written", async () => {
      const token = await t.token({ sub: `registrar-${randomUUID()}` });
      const made = RegistryItem.parse(
        (
          await http
            .post('/api/registry')
            .auth(token, bearer)
            .send({
              kind: 'skill',
              name: `Release summary ${randomUUID().slice(0, 6)}`,
              summary: 'Summarizes a release.',
              team: null,
              sensitivity: 'Internal',
              access,
              triggers: 'release summary',
              skillMd:
                '---\nname: x\n---\n\n# Release summary\n\n## Lead with the date\n\nSay when.\n\n## Keep it short\n\nThree lines.\n',
            })
            .expect(201)
        ).body,
      );
      expect(made.kind === 'skill' && made.details.principles).toEqual([
        { title: 'Lead with the date', text: 'Say when.' },
        { title: 'Keep it short', text: 'Three lines.' },
      ]);
      expect(made.kind === 'skill' && made.details.skillMd).toMatch(/^---\nname: x\n---\n\n# Release summary\n/);
    });
  });
});
