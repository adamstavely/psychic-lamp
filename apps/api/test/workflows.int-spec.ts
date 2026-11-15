import { RegistryItem } from '@donovan/contracts';
import { and, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DB, type Db } from '../src/db/db.module.js';
import { registryItems, registryReviews } from '../src/db/schema.js';
import { REGISTRY_SEED } from '../src/registry/registry.fixture.js';
import { createTestApp, type TestApp } from './support/test-app.js';

describe('workflows on the canvas', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  const bearer = { type: 'bearer' } as const;
  const person = (who: string) => t.token({ sub: `workflow-${who}-${randomUUID()}`, name: `Builder ${who}` });

  beforeAll(async () => {
    t = await createTestApp();
    http = request(t.app.getHttpServer());
  });
  afterAll(async () => {
    const db = t.app.get<Db>(DB);
    await db
      .delete(registryItems)
      .where(sql`${registryItems.ownerId} in (select id from users where subject like 'workflow-%')`);
    // The seeded SKU onboarding was edited by a test: put it back as seeded.
    const seed = REGISTRY_SEED.find((i) => i.kind === 'workflow' && i.id === 'sku')!;
    await db
      .delete(registryReviews)
      .where(and(eq(registryReviews.kind, 'workflow'), eq(registryReviews.itemId, 'sku')));
    await db
      .update(registryItems)
      .set({
        name: seed.name,
        version: seed.version,
        sensitivity: seed.sensitivity,
        status: 'published',
        submittedBy: null,
        reviewRound: 1,
        details: seed.details,
      })
      .where(and(eq(registryItems.kind, 'workflow'), eq(registryItems.id, 'sku')));
    await t.app.close();
  });

  const graph = (nodes: object[], edges: [string, string][]) => ({
    name: 'Invoice intake',
    sensitivity: 'Internal',
    nodes,
    edges,
  });
  const step = (id: string, kind: string, sub: string, x = 40) => ({ id, label: id, kind, sub, x, y: 170 });

  it('starts a draft only its owner sees, and sends it to review once its checks pass', async () => {
    const owner = await person('owner');
    const draft = RegistryItem.parse(
      (await http.post('/api/registry/workflows').auth(owner, bearer).send({ name: 'Invoice intake' }).expect(201))
        .body,
    );
    expect(draft).toMatchObject({ kind: 'workflow', status: 'draft', details: { nodes: [] } });
    await http
      .get(`/api/registry/workflow/${draft.id}`)
      .auth(await person('other'), bearer)
      .expect(404);

    const put = (body: object) => http.put(`/api/registry/workflow/${draft.id}/graph`).auth(owner, bearer).send(body);
    const noTrigger = await put(graph([step('read', 'Tool', 'Filesystem · read_file')], [])).expect(400);
    expect(noTrigger.body.message).toMatch(/Add a trigger/);
    const unapproved = await put(
      graph(
        [step('start', 'Trigger', 'Schedule'), step('post', 'Tool', 'Slack · post_message (write)', 300)],
        [['start', 'post']],
      ),
    ).expect(400);
    expect(unapproved.body.message).toMatch(/no approval before it/);

    const saved = RegistryItem.parse(
      (
        await put(
          graph(
            [
              step('start', 'Trigger', 'Schedule'),
              step('ok', 'Approval', 'Internal · Finance', 300),
              step('post', 'Tool', 'Slack · post_message (write)', 560),
            ],
            [
              ['start', 'ok'],
              ['ok', 'post'],
            ],
          ),
        ).expect(200)
      ).body,
    );
    expect(saved).toMatchObject({ status: 'pending', version: 'v1', details: { state: 'Active' } });
    expect(saved.kind === 'workflow' && saved.details.nodes.map((n) => n.id)).toEqual(['start', 'ok', 'post']);
  });

  it("edits a team's workflow as its next version, which its editor can't approve and two others publish", async () => {
    const editor = await person('editor');
    const seed = REGISTRY_SEED.find((i) => i.kind === 'workflow' && i.id === 'sku')!;
    const nodes = (seed.details as { nodes: { id: string }[] }).nodes;
    const edges = (seed.details as { edges: [string, string][] }).edges;
    const saved = RegistryItem.parse(
      (
        await http
          .put('/api/registry/workflow/sku/graph')
          .auth(editor, bearer)
          .send({ name: 'SKU onboarding', sensitivity: 'Internal', nodes, edges })
          .expect(200)
      ).body,
    );
    expect(saved).toMatchObject({ status: 'pending', version: 'v2' });
    const decide = (token: string) =>
      http.post('/api/governance/queue/workflow/sku/decisions').auth(token, bearer).send({ decision: 'approve' });
    await decide(editor).expect(403);
    await decide(await person('a')).expect(200);
    expect((await decide(await person('b')).expect(200)).body.status).toBe('published');
  });

  it("refuses to change someone else's own workflow", async () => {
    const owner = await person('mine');
    const draft = (await http.post('/api/registry/workflows').auth(owner, bearer).send({ name: 'Mine' }).expect(201))
      .body as { id: string };
    await http
      .put(`/api/registry/workflow/${draft.id}/graph`)
      .auth(await person('intruder'), bearer)
      .send(graph([step('start', 'Trigger', 'Schedule')], []))
      .expect(404);
  });
});
