import {
  ChatSummary,
  DecisionResult,
  GovernanceQueue,
  PolicyList,
  RegistryItem,
  ReviewHistory,
  StreamEvent,
} from '@donovan/contracts';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DB, type Db } from '../src/db/db.module.js';
import { governancePolicies, registryItems } from '../src/db/schema.js';
import { createTestApp, type TestApp } from './support/test-app.js';

describe('/api/governance', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  const bearer = { type: 'bearer' } as const;
  const person = (who: string) => t.token({ sub: `governance-${who}-${randomUUID()}`, name: `Reviewer ${who}` });
  const admin = () => t.token({ sub: `governance-admin-${randomUUID()}`, realm_access: { roles: ['donovan-admin'] } });

  beforeAll(async () => {
    t = await createTestApp();
    http = request(t.app.getHttpServer());
  });
  afterAll(async () => {
    // Submissions are visible to everyone while pending, and policies are workspace-wide: leave neither behind.
    const db = t.app.get<Db>(DB);
    await db
      .delete(registryItems)
      .where(sql`${registryItems.ownerId} in (select id from users where subject like 'governance-%')`);
    await db.delete(governancePolicies);
    await t.app.close();
  });

  const submit = async (token: string, overrides: Record<string, unknown> = {}) =>
    RegistryItem.parse(
      (
        await http
          .post('/api/registry')
          .auth(token, bearer)
          .send({
            kind: 'model',
            name: `Churn scorer ${randomUUID().slice(0, 8)}`,
            summary: 'Scores churn risk.',
            team: null,
            sensitivity: 'Internal',
            access: { readOnly: true, approval: true, internalOnly: false, audit: true },
            task: 'Classification',
            framework: 'PyTorch',
            base: 'XGBoost',
            ...overrides,
          })
          .expect(201)
      ).body,
    );
  const decide = (token: string, item: RegistryItem, decision: string, note = '') =>
    http.post(`/api/governance/queue/${item.kind}/${item.id}/decisions`).auth(token, bearer).send({ decision, note });

  it('publishes on the second approval from two people other than the submitter, and only then', async () => {
    const submitter = await person('submitter');
    const [a, b] = [await person('a'), await person('b')];
    const item = await submit(submitter);

    const queue = GovernanceQueue.parse((await http.get('/api/governance/queue').auth(a, bearer).expect(200)).body);
    expect(queue.items.find((q) => q.item.id === item.id)).toMatchObject({ approvals: 0, mine: false, risk: 'low' });
    const own = GovernanceQueue.parse((await http.get('/api/governance/queue').auth(submitter, bearer)).body);
    expect(own.items.find((q) => q.item.id === item.id)?.mine).toBe(true);

    await decide(submitter, item, 'approve').expect(403);
    expect(DecisionResult.parse((await decide(a, item, 'approve').expect(200)).body)).toEqual({
      status: 'pending',
      approvals: 1,
    });
    await decide(a, item, 'approve').expect(409);
    expect(DecisionResult.parse((await decide(b, item, 'approve').expect(200)).body)).toEqual({
      status: 'published',
      approvals: 2,
    });
    await decide(await person('c'), item, 'approve').expect(409);
    const after = RegistryItem.parse((await http.get(`/api/registry/model/${item.id}`).auth(a, bearer)).body);
    expect(after.status).toBe('published');
  });

  it('takes two second approvals that arrive together one at a time: one publishes, the other is too late', async () => {
    const item = await submit(await person('submitter'));
    await decide(await person('first'), item, 'approve').expect(200);
    const [b, c] = [await person('b'), await person('c')];
    const results = await Promise.all([decide(b, item, 'approve'), decide(c, item, 'approve')]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const ok = results.find((r) => r.status === 200)!;
    expect(DecisionResult.parse(ok.body).status).toBe('published');
  });

  it('stops on a request for changes (which needs a reason), and the submitter resubmits for a new round', async () => {
    const submitter = await person('submitter');
    const reviewer = await person('reviewer');
    const item = await submit(submitter);
    await decide(reviewer, item, 'changes').expect(400);
    expect(
      DecisionResult.parse((await decide(reviewer, item, 'changes', 'Add its evals first.').expect(200)).body).status,
    ).toBe('changes-requested');

    const resubmit = (token: string) =>
      http
        .post(`/api/governance/queue/model/${item.id}/resubmit`)
        .auth(token, bearer)
        .send({ summary: 'Scores churn risk, with evals.' });
    await resubmit(reviewer).expect(409);
    await resubmit(submitter).expect(204);
    // A new round: the same reviewer can decide again.
    await decide(reviewer, item, 'approve').expect(200);

    const history = ReviewHistory.parse(
      (await http.get(`/api/governance/history/model/${item.id}`).auth(submitter, bearer).expect(200)).body,
    );
    expect(history.round).toBe(2);
    expect(history.records.map((r) => [r.round, r.decision, r.note])).toEqual([
      [1, 'changes', 'Add its evals first.'],
      [2, 'approve', ''],
    ]);
  });

  it('lets only a Donovan admin change a policy, and enforces it: approval off runs write tools without asking', async () => {
    const someone = await person('someone');
    const list = PolicyList.parse((await http.get('/api/governance/policies').auth(someone, bearer).expect(200)).body);
    expect(list.canChange).toBe(false);
    expect(list.policies.find((p) => p.id === 'per-tool-approval')?.enabled).toBe(true);
    await http
      .patch('/api/governance/policies/per-tool-approval')
      .auth(someone, bearer)
      .send({ enabled: false })
      .expect(403);

    const boss = await admin();
    expect(PolicyList.parse((await http.get('/api/governance/policies').auth(boss, bearer)).body).canChange).toBe(true);
    await http
      .patch('/api/governance/policies/per-tool-approval')
      .auth(boss, bearer)
      .send({ enabled: false })
      .expect(200);
    try {
      const chat = ChatSummary.parse(
        (await http.post('/api/chats').auth(someone, bearer).send({ text: 'Post it' }).expect(201)).body,
      );
      const res = await http
        .post(`/api/chats/${chat.id}/messages`)
        .auth(someone, bearer)
        .send({ text: 'Post the rollout update to the team' })
        .expect(200);
      const done = res.text
        .split('\n\n')
        .filter(Boolean)
        .map((c) =>
          StreamEvent.parse(
            JSON.parse(
              c
                .split('\n')
                .find((l) => l.startsWith('data: '))!
                .slice(6),
            ),
          ),
        )
        .at(-1);
      const tool = done?.type === 'done' ? done.message.blocks.find((b) => b.type === 'tool') : undefined;
      expect(tool).toMatchObject({ name: 'post_message', status: 'done' });
    } finally {
      await http.patch('/api/governance/policies/per-tool-approval').auth(boss, bearer).send({ enabled: true });
    }
  });

  it('keeps Confidential servers in the workspace while that policy is on', async () => {
    const token = await person('installer');
    const url = '/api/registry/server/slack/installs';
    await http.post(url).auth(token, bearer).send({ client: 'cursor' }).expect(400);
    await http.post(url).auth(token, bearer).send({ client: 'donovan-chat' }).expect(200);
  });
});
