import { Artifact, ArtifactSummary, Chat } from '@donovan/contracts';
import request from 'supertest';
import { z } from 'zod';
import { createTestApp, type TestApp } from './support/test-app.js';

const List = z.array(ArtifactSummary);

describe('/api/artifacts', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  const bearer = { type: 'bearer' } as const;
  beforeAll(async () => {
    t = await createTestApp();
    http = request(t.app.getHttpServer());
  });
  afterAll(() => t.app.close());

  it('seeds the artifacts every chat links to, newest first', async () => {
    const token = await t.token();
    const list = List.parse((await http.get('/api/artifacts').auth(token, bearer).expect(200)).body);
    expect(list).toHaveLength(7);
    expect(list[0]!.name).toBe('Rollout note — Fraud Sentinel v3.2');
    const fraud = Chat.parse((await http.get('/api/chats/fraud').auth(token, bearer)).body);
    const linked = fraud.messages
      .flatMap((m) => (m.role === 'assistant' ? m.blocks : []))
      .flatMap((b) => (b.type === 'artifact' ? [b.artifactId] : []));
    for (const id of linked) expect(list.map((a) => a.id)).toContain(id);
  });

  it("finds artifacts on a person's very first search, even while the first list is still seeding them", async () => {
    const token = await t.token();
    const [, found] = await Promise.all([
      http.get('/api/artifacts').auth(token, bearer),
      http.get('/api/artifacts?q=break-glass').auth(token, bearer),
    ]);
    expect(List.parse(found.body).map((a) => a.name)).toEqual(['approval_tiers_rfc.md']);
  });

  it('filters by kind and finds by words in the name or body', async () => {
    const token = await t.token();
    const data = List.parse((await http.get('/api/artifacts?kind=Data').auth(token, bearer)).body);
    expect(data.map((a) => a.name).sort()).toEqual(['churn_compare.csv', 'cohort.json']);
    const found = List.parse((await http.get('/api/artifacts?q=break-glass').auth(token, bearer)).body);
    expect(found.map((a) => a.name)).toEqual(['approval_tiers_rfc.md']);
    const byPart = List.parse((await http.get('/api/artifacts?q=cohort').auth(token, bearer)).body);
    expect(byPart.map((a) => a.name)).toContain('cohort.json');
    const fuzzy = List.parse((await http.get('/api/artifacts?q=rollbak').auth(token, bearer)).body);
    expect(fuzzy[0]!.name).toBe('Rollout note — Fraud Sentinel v3.2');
  });

  it("keeps one person's artifacts out of another's search", async () => {
    const alex = await t.token();
    const mara = await t.token();
    await http
      .post('/api/artifacts')
      .auth(alex, bearer)
      .send({ name: 'secret-plan.md', content: '# Zanzibar\n\nOnly Alex knows.' })
      .expect(201);
    expect(List.parse((await http.get('/api/artifacts?q=zanzibar').auth(alex, bearer)).body)).toHaveLength(1);
    expect(List.parse((await http.get('/api/artifacts?q=zanzibar').auth(mara, bearer)).body)).toHaveLength(0);
  });

  it('returns an artifact with its versions and body', async () => {
    const token = await t.token({ name: 'Alex Morgan' });
    const a = Artifact.parse(
      (await http.get('/api/artifacts/approval-tiers-rfc-md').auth(token, bearer).expect(200)).body,
    );
    expect(a.versions.map((v) => v.version)).toEqual([1, 2]);
    expect(a.chat).toEqual({ id: 'rfc', title: 'Draft RFC: tool approval tiers' });
    expect(a.owner).toBe('Alex Morgan');
    await http.get('/api/artifacts/nope').auth(token, bearer).expect(404);
  });

  it('turns an uploaded CSV into data, and says why it refuses a file', async () => {
    const token = await t.token();
    const up = ArtifactSummary.parse(
      (
        await http
          .post('/api/artifacts')
          .auth(token, bearer)
          .send({ name: 'q3.csv', content: 'region,revenue\nEU,10\nUS,12' })
          .expect(201)
      ).body,
    );
    expect(up).toMatchObject({ kind: 'Data', chat: null, version: 1 });
    const a = Artifact.parse((await http.get(`/api/artifacts/${up.id}`).auth(token, bearer)).body);
    expect(a.body).toMatchObject({
      kind: 'Data',
      columns: ['region', 'revenue'],
      rows: [
        ['EU', '10'],
        ['US', '12'],
      ],
    });
    const bad = await http
      .post('/api/artifacts')
      .auth(token, bearer)
      .send({ name: 'x.json', content: '{nope' })
      .expect(400);
    expect(bad.body.message).toBe("That JSON doesn't parse");
    await http.post('/api/artifacts').auth(token, bearer).send({ name: 'x.exe', content: 'MZ' }).expect(400);
  });
});
