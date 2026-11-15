import { RegistryItem } from '@donovan/contracts';
import { and, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DB, type Db } from '../src/db/db.module.js';
import { registryItems, registryReviews, registryRevisions } from '../src/db/schema.js';
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
      .delete(registryRevisions)
      .where(and(eq(registryRevisions.kind, 'workflow'), eq(registryRevisions.itemId, 'sku')));
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
        proposal: null,
      })
      .where(and(eq(registryItems.kind, 'workflow'), eq(registryItems.id, 'sku')));
    await t.app.close();
  });

  const graph = (nodes: object[], edges: [string, string][], revision = 1) => ({
    revision,
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
    const { revision } = (await http.get('/api/registry/workflow/sku').auth(editor, bearer).expect(200)).body as {
      revision: number;
    };
    const saved = RegistryItem.parse(
      (
        await http
          .put('/api/registry/workflow/sku/graph')
          .auth(editor, bearer)
          .send({ revision, name: 'SKU onboarding', sensitivity: 'Internal', nodes, edges })
          .expect(200)
      ).body,
    );
    expect(saved).toMatchObject({ status: 'pending', version: 'v2', revision: revision + 1 });
    const decide = (token: string) =>
      http
        .post('/api/governance/queue/workflow/sku/decisions')
        .auth(token, bearer)
        .send({ revision: saved.revision, decision: 'approve' });
    await decide(editor).expect(403);
    await decide(await person('a')).expect(200);
    expect((await decide(await person('b')).expect(200)).body.status).toBe('published');
  });

  it('numbers a second draft with the same name instead of refusing it', async () => {
    const owner = await person('twice');
    const make = async () =>
      (await http.post('/api/registry/workflows').auth(owner, bearer).send({ name: 'Untitled workflow' }).expect(201))
        .body as { name: string; id: string };
    const [a, b] = [await make(), await make()];
    expect([a.name, b.name]).toEqual(['Untitled workflow', 'Untitled workflow 2']);
    expect(a.id).not.toBe(b.id);
  });

  /** A workflow of the person's own, saved once so it's waiting for review. */
  const pending = async (owner: string) => {
    const draft = RegistryItem.parse(
      (await http.post('/api/registry/workflows').auth(owner, bearer).send({ name: 'Bound review' }).expect(201)).body,
    );
    return RegistryItem.parse(
      (
        await http
          .put(`/api/registry/workflow/${draft.id}/graph`)
          .auth(owner, bearer)
          .send(graph([step('start', 'Trigger', 'Schedule')], [], draft.revision))
          .expect(200)
      ).body,
    );
  };

  it("refuses approvals made on a version that's since been replaced, and records which version was approved", async () => {
    const owner = await person('bound');
    const [a, b] = [await person('ra'), await person('rb')];
    const v1 = await pending(owner);
    // Both reviewers open the queue on v1; then the owner replaces it with v2, a new round.
    const queued = (
      (await http.get('/api/governance/queue').auth(a, bearer).expect(200)).body as {
        items: { item: { id: string; revision: number } }[];
      }
    ).items.find((q) => q.item.id === v1.id)!;
    expect(queued.item.revision).toBe(v1.revision);
    const v2 = RegistryItem.parse(
      (
        await http
          .put(`/api/registry/workflow/${v1.id}/graph`)
          .auth(owner, bearer)
          .send(graph([step('start', 'Trigger', 'Webhook')], [], v1.revision))
          .expect(200)
      ).body,
    );
    expect(v2.version).toBe('v2');
    const approve = (token: string, revision: number) =>
      http
        .post(`/api/governance/queue/workflow/${v1.id}/decisions`)
        .auth(token, bearer)
        .send({ revision, decision: 'approve' });

    // The approvals from the old screen are refused, and nothing is published.
    expect((await approve(a, v1.revision).expect(409)).body.message).toMatch(/v2 is waiting now/);
    await approve(b, v1.revision).expect(409);
    const still = RegistryItem.parse((await http.get(`/api/registry/workflow/${v1.id}`).auth(owner, bearer)).body);
    expect(still).toMatchObject({ status: 'pending', version: 'v2' });

    // Reloaded, they approve v2, which publishes it; the history names the version each approved.
    await approve(a, v2.revision).expect(200);
    expect((await approve(b, v2.revision).expect(200)).body.status).toBe('published');
    const history = (await http.get(`/api/governance/history/workflow/${v1.id}`).auth(owner, bearer).expect(200))
      .body as { records: { revision: number; version: string }[] };
    expect(history.records.map((r) => [r.version, r.revision])).toEqual([
      ['v2', v2.revision],
      ['v2', v2.revision],
    ]);
    const db = t.app.get<Db>(DB);
    const [snapshot] = await db
      .select()
      .from(registryRevisions)
      .where(and(eq(registryRevisions.itemId, v1.id), eq(registryRevisions.revision, v2.revision)));
    expect(snapshot?.details).toMatchObject({ nodes: [{ sub: 'Webhook' }] });
  });

  it('accepts one of several saves made on the same revision, and refuses the rest instead of overwriting', async () => {
    const owner = await person('racer');
    const v1 = await pending(owner);
    const results = await Promise.all(
      [1, 2, 3, 4, 5, 6].map((n) =>
        http
          .put(`/api/registry/workflow/${v1.id}/graph`)
          .auth(owner, bearer)
          .send({ ...graph([step('start', 'Trigger', `Schedule ${n}`)], [], v1.revision), name: `Edit ${n}` }),
      ),
    );
    const accepted = results.filter((r) => r.status === 200);
    expect(accepted).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(5);
    const now = RegistryItem.parse((await http.get(`/api/registry/workflow/${v1.id}`).auth(owner, bearer)).body);
    // The accepted edit is what's stored, as the next version.
    expect(now).toMatchObject({ version: 'v2', revision: v1.revision + 1, name: accepted[0]!.body.name });
  });

  it('refuses a graph in which two steps share an id', async () => {
    const owner = await person('dupe');
    const draft = RegistryItem.parse(
      (await http.post('/api/registry/workflows').auth(owner, bearer).send({ name: 'Dupe' }).expect(201)).body,
    );
    const res = await http
      .put(`/api/registry/workflow/${draft.id}/graph`)
      .auth(owner, bearer)
      .send(
        graph(
          [
            step('start', 'Trigger', 'Schedule'),
            step('same', 'Tool', 'Filesystem · read_file'),
            step('same', 'Model', 'x'),
          ],
          [['start', 'same']],
          draft.revision,
        ),
      )
      .expect(400);
    expect(JSON.stringify(res.body)).toMatch(/Each step needs its own id/);
    const still = RegistryItem.parse((await http.get(`/api/registry/workflow/${draft.id}`).auth(owner, bearer)).body);
    expect(still).toMatchObject({ status: 'draft', details: { nodes: [] } });
  });

  it("keeps a team's workflow, sent back after someone edited it, theirs to see, revise and resubmit", async () => {
    const db = t.app.get<Db>(DB);
    const id = `team-flow-${randomUUID().slice(0, 8)}`;
    const nodes = [step('start', 'Trigger', 'Schedule')];
    await db.insert(registryItems).values({
      kind: 'workflow',
      id,
      name: 'Team flow',
      slug: `platform/${id}`,
      version: 'v1',
      sensitivity: 'Internal',
      summary: 'A team workflow.',
      ownerTeam: 'Platform',
      ownerId: null,
      ownerName: 'Platform',
      status: 'published',
      details: { state: 'Active', schedule: 'daily', nodes, edges: [] } as never,
    });
    try {
      const [editor, reviewer, other] = [await person('teamedit'), await person('teamrev'), await person('teamother')];
      const saved = RegistryItem.parse(
        (
          await http
            .put(`/api/registry/workflow/${id}/graph`)
            .auth(editor, bearer)
            .send({ ...graph(nodes, [], 1), name: 'Team flow' })
            .expect(200)
        ).body,
      );
      await http
        .post(`/api/governance/queue/workflow/${id}/decisions`)
        .auth(reviewer, bearer)
        .send({ revision: saved.revision, decision: 'changes', note: 'Name the schedule.' })
        .expect(200);

      // The editor still sees it, in Mine, with the reason and the right to resubmit; everyone else sees the published v1.
      const back = RegistryItem.parse(
        (await http.get(`/api/registry/workflow/${id}`).auth(editor, bearer).expect(200)).body,
      );
      expect(back.status).toBe('changes-requested');
      const mine = (await http.get('/api/registry?kind=workflow&scope=mine').auth(editor, bearer).expect(200)).body as {
        id: string;
      }[];
      expect(mine.map((i) => i.id)).toContain(id);
      const history = (await http.get(`/api/governance/history/workflow/${id}`).auth(editor, bearer).expect(200))
        .body as { canResubmit: boolean; records: { note: string }[] };
      expect(history).toMatchObject({ canResubmit: true, records: [{ note: 'Name the schedule.' }] });
      const seen = RegistryItem.parse(
        (await http.get(`/api/registry/workflow/${id}`).auth(other, bearer).expect(200)).body,
      );
      expect(seen).toMatchObject({ status: 'published', version: 'v1', editInReview: null });
      const theirs = (await http.get(`/api/governance/history/workflow/${id}`).auth(other, bearer).expect(200))
        .body as { canResubmit: boolean };
      expect(theirs.canResubmit).toBe(false);

      // They revise it, which sends it back to review as the next version.
      const revised = RegistryItem.parse(
        (
          await http
            .put(`/api/registry/workflow/${id}/graph`)
            .auth(editor, bearer)
            .send({
              ...graph([step('start', 'Trigger', 'Schedule · daily 9:00')], [], back.revision),
              name: 'Team flow',
            })
            .expect(200)
        ).body,
      );
      expect(revised).toMatchObject({ status: 'pending', version: 'v3' });
      const after = (await http.get(`/api/governance/history/workflow/${id}`).auth(editor, bearer).expect(200))
        .body as { canResubmit: boolean };
      expect(after.canResubmit).toBe(false);
    } finally {
      await db.delete(registryItems).where(and(eq(registryItems.kind, 'workflow'), eq(registryItems.id, id)));
    }
  });

  /** A published team workflow of one step, removed after the test. */
  const teamFlow = async (run: (id: string) => Promise<void>) => {
    const db = t.app.get<Db>(DB);
    const id = `live-flow-${randomUUID().slice(0, 8)}`;
    await db.insert(registryItems).values({
      kind: 'workflow',
      id,
      name: 'Live flow',
      slug: `platform/${id}`,
      version: 'v1',
      sensitivity: 'Internal',
      summary: 'A team workflow.',
      ownerTeam: 'Platform',
      ownerId: null,
      ownerName: 'Platform',
      status: 'published',
      details: {
        state: 'Active',
        schedule: 'daily',
        nodes: [step('start', 'Trigger', 'Schedule')],
        edges: [],
      } as never,
    });
    try {
      await run(id);
    } finally {
      await db.delete(registryItems).where(and(eq(registryItems.kind, 'workflow'), eq(registryItems.id, id)));
    }
  };
  const view = async (token: string, id: string) =>
    RegistryItem.parse((await http.get(`/api/registry/workflow/${id}`).auth(token, bearer).expect(200)).body);
  const subs = (w: RegistryItem) => (w.kind === 'workflow' ? w.details.nodes.map((n) => n.sub) : []);
  const editTo = async (token: string, id: string, sub: string, revision: number) =>
    RegistryItem.parse(
      (
        await http
          .put(`/api/registry/workflow/${id}/graph`)
          .auth(token, bearer)
          .send({ ...graph([step('start', 'Trigger', sub)], [], revision), name: 'Live flow' })
          .expect(200)
      ).body,
    );
  const decideOn = (token: string, id: string, revision: number, decision: string, note = '') =>
    http
      .post(`/api/governance/queue/workflow/${id}/decisions`)
      .auth(token, bearer)
      .send({ revision, decision, note })
      .expect(200);

  it('keeps the published version live for everyone else while an edit of it is in review, and after a rejection', async () => {
    await teamFlow(async (id) => {
      const [editor, reviewer, other] = [await person('liveedit'), await person('liverev'), await person('liveother')];
      const v2 = await editTo(editor, id, 'Webhook', 1);
      expect(v2).toMatchObject({ status: 'pending', version: 'v2', liveVersion: 'v1' });
      expect(subs(v2)).toEqual(['Webhook']);

      // Everyone else still sees and runs v1, and is told v2 is in review.
      const seen = await view(other, id);
      expect(seen).toMatchObject({ status: 'published', version: 'v1', liveVersion: null, editInReview: 'v2' });
      expect(subs(seen)).toEqual(['Schedule']);
      const listed = (await http.get('/api/registry?kind=workflow').auth(other, bearer).expect(200)).body as {
        id: string;
        version: string;
      }[];
      expect(listed.find((i) => i.id === id)?.version).toBe('v1');

      // The review queue shows reviewers the edit, as an edit of v1.
      const queued = (
        (await http.get('/api/governance/queue').auth(reviewer, bearer).expect(200)).body as {
          items: { item: { id: string; version: string; revision: number; liveVersion: string | null } }[];
        }
      ).items.find((q) => q.item.id === id)!;
      expect(queued.item).toMatchObject({ version: 'v2', revision: v2.revision, liveVersion: 'v1' });
      // Reviewers can open the edit itself.
      const proposed = RegistryItem.parse(
        (await http.get(`/api/registry/workflow/${id}/proposed`).auth(reviewer, bearer).expect(200)).body,
      );
      expect(proposed).toMatchObject({ status: 'pending', version: 'v2', liveVersion: 'v1' });
      expect(subs(proposed)).toEqual(['Webhook']);

      // Someone else can't start a second edit over it while it's in review.
      const second = await http
        .put(`/api/registry/workflow/${id}/graph`)
        .auth(other, bearer)
        .send({ ...graph([step('start', 'Trigger', 'Chat command')], [], seen.revision), name: 'Live flow' })
        .expect(409);
      expect(second.body.message).toMatch(/v2 is in review/);

      // Rejected: v1 stays published for everyone; the editor sees their rejected v2, and can resubmit it.
      await decideOn(reviewer, id, v2.revision, 'reject', 'Not a webhook.');
      const after = await view(other, id);
      expect(after).toMatchObject({ status: 'published', version: 'v1', editInReview: null });
      expect(subs(after)).toEqual(['Schedule']);
      await http.get(`/api/registry/workflow/${id}/proposed`).auth(other, bearer).expect(404);
      expect(await view(editor, id)).toMatchObject({ status: 'rejected', version: 'v2', liveVersion: 'v1' });
      const history = (await http.get(`/api/governance/history/workflow/${id}`).auth(editor, bearer).expect(200))
        .body as { canResubmit: boolean; records: { version: string; decision: string }[] };
      expect(history).toMatchObject({ canResubmit: true, records: [{ version: 'v2', decision: 'reject' }] });
      const theirs = (await http.get(`/api/governance/history/workflow/${id}`).auth(other, bearer).expect(200))
        .body as { canResubmit: boolean };
      expect(theirs.canResubmit).toBe(false);
    });
  });

  it('publishes an edit of a published workflow in place of the old version once two people approve it', async () => {
    await teamFlow(async (id) => {
      const [editor, a, b, other] = [
        await person('pubedit'),
        await person('pubra'),
        await person('pubrb'),
        await person('pubother'),
      ];
      const v2 = await editTo(editor, id, 'Webhook', 1);
      await decideOn(a, id, v2.revision, 'approve');
      expect(subs(await view(other, id))).toEqual(['Schedule']);
      expect((await decideOn(b, id, v2.revision, 'approve')).body.status).toBe('published');

      const seen = await view(other, id);
      expect(seen).toMatchObject({
        status: 'published',
        version: 'v2',
        revision: v2.revision,
        liveVersion: null,
        editInReview: null,
      });
      expect(subs(seen)).toEqual(['Webhook']);
      expect(await view(editor, id)).toMatchObject({ status: 'published', version: 'v2', liveVersion: null });

      // The next edit builds on v2, and is v3.
      expect(await editTo(other, id, 'Chat command', seen.revision)).toMatchObject({
        version: 'v3',
        liveVersion: 'v2',
      });
    });
  });

  it('leaves the published version live when an edit of it is sent back, until its editor revises it', async () => {
    await teamFlow(async (id) => {
      const [editor, reviewer, other] = [await person('backedit'), await person('backrev'), await person('backother')];
      const v2 = await editTo(editor, id, 'Webhook', 1);
      await decideOn(reviewer, id, v2.revision, 'changes', 'Name the hook.');
      expect(await view(other, id)).toMatchObject({ status: 'published', version: 'v1', editInReview: null });
      const back = await view(editor, id);
      expect(back).toMatchObject({ status: 'changes-requested', version: 'v2', liveVersion: 'v1' });

      // A save from a screen still showing v1 is stale: their v2 came after it.
      await http
        .put(`/api/registry/workflow/${id}/graph`)
        .auth(editor, bearer)
        .send({ ...graph([step('start', 'Trigger', 'Webhook · orders')], [], 1), name: 'Live flow' })
        .expect(409);
      const v3 = await editTo(editor, id, 'Webhook · orders', back.revision);
      expect(v3).toMatchObject({ status: 'pending', version: 'v3', liveVersion: 'v1' });
      expect(await view(other, id)).toMatchObject({ version: 'v1', editInReview: 'v3' });
    });
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
