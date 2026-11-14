import {
  Artifact,
  ArtifactSummary,
  Chat,
  Project,
  ProjectAnswer,
  ProjectsOverview,
  ProjectSummary,
  ProjectSource,
  Recipient,
  SourceCatalog,
  SourceSearchResult,
} from '@donovan/contracts';
import { z } from 'zod';
import request from 'supertest';
import { createTestApp, type TestApp } from './support/test-app.js';

describe('/api/projects', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  const bearer = { type: 'bearer' } as const;
  beforeAll(async () => {
    t = await createTestApp();
    http = request(t.app.getHttpServer());
  });
  afterAll(() => t.app.close());

  it("lists org libraries and the person's projects, most recent first", async () => {
    const token = await t.token();
    const o = ProjectsOverview.parse((await http.get('/api/projects').auth(token, bearer).expect(200)).body);
    expect(o.org).toHaveLength(4);
    expect(o.mine.map((p) => p.id)).toEqual(['supplier-risk', 'fraud-rollout', 'support-triage', 'sku-onboarding']);
    expect(o.mine.find((p) => p.id === 'fraud-rollout')!.sourceCount).toBe(6);
  });

  it('opens a project with a cited guide, its chats and suggestions', async () => {
    const token = await t.token();
    const p = Project.parse((await http.get('/api/projects/fraud-rollout').auth(token, bearer).expect(200)).body);
    expect(p.guide.flatMap((s) => s.cite)).toEqual(['s2', 's3', 's4', 's6']);
    expect(p.chats.map((c) => c.id)).toEqual(['fraud']);
    expect(p.suggestions).toHaveLength(3);
  });

  it('cites only selected sources, and refuses to answer from none', async () => {
    const token = await t.token();
    await http
      .put('/api/projects/sku-onboarding/sources/s3/selected')
      .auth(token, bearer)
      .send({ selected: false })
      .expect(204);
    const a = ProjectAnswer.parse(
      (
        await http
          .post('/api/projects/sku-onboarding/ask')
          .auth(token, bearer)
          .send({ question: 'Which attributes are unmapped?' })
          .expect(200)
      ).body,
    );
    expect(a.answer.flatMap((s) => s.cite)).toEqual(['s1', 's2']);
    expect(a.sourcesRead).toBe(3);
    for (const s of ['s1', 's2', 's3', 's4'])
      await http
        .put(`/api/projects/sku-onboarding/sources/${s}/selected`)
        .auth(token, bearer)
        .send({ selected: false })
        .expect(204);
    await http.post('/api/projects/sku-onboarding/ask').auth(token, bearer).send({ question: 'Anything?' }).expect(400);
  });

  it('adds suggested sources and keeps notes', async () => {
    const token = await t.token();
    const before = Project.parse((await http.get('/api/projects/support-triage').auth(token, bearer)).body);
    const pick = before.suggestions.find((s) => s.title === 'Returns process redesign notes')!;
    await http
      .post('/api/projects/support-triage/sources')
      .auth(token, bearer)
      .send({ sources: [{ kind: pick.kind, title: pick.title, meta: pick.meta }] })
      .expect(204);
    await http
      .post('/api/projects/support-triage/notes')
      .auth(token, bearer)
      .send({ text: 'Returns look like exchanges.' })
      .expect(204);
    const p = Project.parse((await http.get('/api/projects/support-triage').auth(token, bearer)).body);
    expect(p.sources.at(-1)).toMatchObject({ id: 's6', title: 'Returns process redesign notes', selected: true });
    expect(p.suggestions.map((s) => s.title)).not.toContain('Returns process redesign notes');
    expect(p.notes[0]!.text).toBe('Returns look like exchanges.');
    await http.delete(`/api/projects/support-triage/notes/${p.notes[0]!.id}`).auth(token, bearer).expect(204);
    await http.post('/api/projects/support-triage/sources').auth(token, bearer).send({ sources: [] }).expect(400);
  });

  it('creates a project, from scratch or from an org library, and renames carry to its chats', async () => {
    const token = await t.token();
    const blank = ProjectSummary.parse(
      (
        await http
          .post('/api/projects')
          .auth(token, bearer)
          .send({ name: 'Pricing study', calibrated: true })
          .expect(201)
      ).body,
    );
    expect(blank).toMatchObject({ name: 'Pricing study', calibrated: true, sourceCount: 0 });
    const copy = ProjectSummary.parse(
      (
        await http
          .post('/api/projects')
          .auth(token, bearer)
          .send({ name: 'My Q4 hub', fromLibrary: 'q4-planning' })
          .expect(201)
      ).body,
    );
    expect(copy.sourceCount).toBe(2);
    await http.post('/api/projects').auth(token, bearer).send({ name: '' }).expect(400);

    await http.patch('/api/projects/fraud-rollout').auth(token, bearer).send({ name: 'Sentinel rollout' }).expect(200);
    const chat = Chat.parse((await http.get('/api/chats/fraud').auth(token, bearer)).body);
    expect(chat.project).toBe('Sentinel rollout');
  });

  it('searches for sources by scope and depth, and adds what it finds', async () => {
    const token = await t.token();
    const quick = SourceSearchResult.parse(
      (
        await http
          .post('/api/projects/fraud-rollout/source-search')
          .auth(token, bearer)
          .send({ query: 'card scheme declines', scope: 'web' })
          .expect(200)
      ).body,
    );
    expect(quick.results.every((r) => r.kind === 'web')).toBe(true);
    expect(quick.results.map((r) => r.title)).toContain('Card scheme rules for real-time declines (2026 update)');
    const deep = SourceSearchResult.parse(
      (
        await http
          .post('/api/projects/fraud-rollout/source-search')
          .auth(token, bearer)
          .send({ query: 'chargebacks', depth: 'deep' })
          .expect(200)
      ).body,
    );
    expect(deep.results.length).toBeGreaterThan(quick.results.length);
    await http
      .post('/api/projects/fraud-rollout/sources')
      .auth(token, bearer)
      .send({ sources: deep.results.slice(0, 2) })
      .expect(204);
    const p = Project.parse((await http.get('/api/projects/fraud-rollout').auth(token, bearer)).body);
    expect(p.sources).toHaveLength(8);
    await http
      .put('/api/projects/fraud-rollout/sources/selected')
      .auth(token, bearer)
      .send({ selected: false })
      .expect(204);
    const none = Project.parse((await http.get('/api/projects/fraud-rollout').auth(token, bearer)).body);
    expect(none.sources.every((s) => !s.selected)).toBe(true);
    expect(none.guide).toEqual([]);
  });

  it('adds sources by hand: an upload, a link, a connector, a dataset and pasted text', async () => {
    const token = await t.token();
    const catalog = SourceCatalog.parse(
      (await http.get('/api/projects/source-catalog').auth(token, bearer).expect(200)).body,
    );
    expect(catalog.connectors.length).toBeGreaterThan(0);
    expect(catalog.datasets.length).toBeGreaterThan(0);
    const add = async (body: object) =>
      ProjectSource.parse(
        (await http.post('/api/projects/sku-onboarding/sources/new').auth(token, bearer).send(body).expect(201)).body,
      );
    const upload = await add({ from: 'upload', name: 'attribute-map.csv', size: 2048, content: 'gs1,ours\n' });
    expect(upload).toMatchObject({
      kind: 'sheet',
      title: 'attribute-map.csv',
      meta: 'CSV · 2 KB · uploaded',
      selected: true,
    });
    expect(await add({ from: 'link', url: 'https://www.gs1.org/standards/gdsn' })).toMatchObject({
      kind: 'web',
      title: 'gs1.org/standards/gdsn',
      meta: 'Web · gs1.org',
    });
    expect(await add({ from: 'connector', id: catalog.connectors[0]!.id })).toMatchObject({ kind: 'connector' });
    expect(await add({ from: 'dataset', id: catalog.datasets[0]!.id })).toMatchObject({ kind: 'dataset' });
    const paste = await add({ from: 'paste', text: 'Pack size goes in the net content field, not the title.' });
    expect(paste).toMatchObject({ kind: 'doc', meta: 'Text · 11 words · pasted' });
    expect(paste.title).toMatch(/^Pack size goes in the net content field/);

    const p = Project.parse((await http.get('/api/projects/sku-onboarding').auth(token, bearer).expect(200)).body);
    expect(p.sources.slice(-5).map((s) => s.kind)).toEqual(['sheet', 'web', 'connector', 'dataset', 'doc']);
    expect(new Set(p.sources.map((s) => s.id)).size).toBe(p.sources.length);

    await http
      .post('/api/projects/sku-onboarding/sources/new')
      .auth(token, bearer)
      .send({ from: 'link', url: 'ftp://example.com/x' })
      .expect(400);
    await http
      .post('/api/projects/sku-onboarding/sources/new')
      .auth(token, bearer)
      .send({ from: 'connector', id: 'nope' })
      .expect(400);
  });

  it('searches connectors and datasets', async () => {
    const token = await t.token();
    const r = SourceSearchResult.parse(
      (
        await http
          .post('/api/projects/fraud-rollout/source-search')
          .auth(token, bearer)
          .send({ query: 'support tickets', scope: 'connectors' })
          .expect(200)
      ).body,
    );
    expect(r.results.length).toBeGreaterThan(0);
    expect(r.results.every((x) => x.kind === 'connector' || x.kind === 'dataset')).toBe(true);
  });

  it('keeps the chat, and in Calibrated mode labels each claim and says what to check', async () => {
    const token = await t.token();
    const ask = async (question: string) =>
      ProjectAnswer.parse(
        (await http.post('/api/projects/fraud-rollout/ask').auth(token, bearer).send({ question }).expect(200)).body,
      );
    const plain = await ask('What changes between v3.1 and v3.2?');
    expect(plain.claims).toBeNull();
    expect(plain.checkpoint).toBeNull();

    await http.patch('/api/projects/fraud-rollout').auth(token, bearer).send({ calibrated: true }).expect(200);
    const calibrated = await ask('Summarize the threshold debate');
    expect(calibrated.claims!.length).toBeGreaterThan(0);
    expect(calibrated.claims!.every((c) => ['grounded', 'inferred'].includes(c.kind))).toBe(true);
    expect(calibrated.claims!.filter((c) => c.kind === 'grounded').every((c) => c.source !== null)).toBe(true);
    expect(calibrated.checkpoint).toMatch(/^Before acting|Spot-check/);

    let p = Project.parse((await http.get('/api/projects/fraud-rollout').auth(token, bearer).expect(200)).body);
    expect(p.thread.map((a) => a.question)).toEqual([
      'What changes between v3.1 and v3.2?',
      'Summarize the threshold debate',
    ]);

    const brief = ArtifactSummary.parse(
      (await http.post('/api/projects/fraud-rollout/outputs').auth(token, bearer).send({ tool: 'brief' }).expect(201))
        .body,
    );
    const made = Artifact.parse((await http.get(`/api/artifacts/${brief.id}`).auth(token, bearer).expect(200)).body);
    expect(
      made.body.kind === 'Doc' && made.body.blocks.some((b) => b.type === 'heading' && /^Claims/.test(b.text)),
    ).toBe(true);

    await http.delete('/api/projects/fraud-rollout/thread').auth(token, bearer).expect(204);
    p = Project.parse((await http.get('/api/projects/fraud-rollout').auth(token, bearer).expect(200)).body);
    expect(p.thread).toEqual([]);
  });

  it('makes a Studio output as an artifact filed under the project', async () => {
    const token = await t.token();
    const made = ArtifactSummary.parse(
      (await http.post('/api/projects/support-triage/outputs').auth(token, bearer).send({ tool: 'brief' }).expect(201))
        .body,
    );
    expect(made).toMatchObject({ name: 'Brief — Support triage', project: 'Support triage', kind: 'Doc' });
    const p = Project.parse((await http.get('/api/projects/support-triage').auth(token, bearer)).body);
    expect(p.outputs.map((o) => o.title)).toEqual(
      expect.arrayContaining(['Brief — Support triage', 'September intents summary']),
    );
    const a = Artifact.parse((await http.get(`/api/artifacts/${made.id}`).auth(token, bearer)).body);
    expect(a.sources).toHaveLength(5);
  });

  it('files an artifact under another project from the artifact', async () => {
    const token = await t.token();
    const moved = ArtifactSummary.parse(
      (
        await http
          .patch('/api/artifacts/churn-compare-csv')
          .auth(token, bearer)
          .send({ projectId: 'supplier-risk' })
          .expect(200)
      ).body,
    );
    expect(moved.project).toBe('Supplier risk');
    const p = Project.parse((await http.get('/api/projects/supplier-risk').auth(token, bearer)).body);
    expect(p.outputs.map((o) => o.artifactId)).toContain('churn-compare-csv');
    await http.patch('/api/artifacts/churn-compare-csv').auth(token, bearer).send({ projectId: 'nope' }).expect(404);
  });

  it('shares a project with people and teams from the directory', async () => {
    const token = await t.token();
    const dir = z
      .array(Recipient)
      .parse((await http.get('/api/projects/directory').auth(token, bearer).expect(200)).body);
    const team = dir.find((r) => r.name === 'Risk Ops')!;
    await http
      .put('/api/projects/fraud-rollout/shares')
      .auth(token, bearer)
      .send({ access: [{ recipient: team, level: 'editor' }] })
      .expect(204);
    const p = Project.parse((await http.get('/api/projects/fraud-rollout').auth(token, bearer)).body);
    expect(p.sharedWith).toEqual([{ recipient: team, level: 'editor' }]);
    expect(p.attached).toContain('Slack');
  });

  it('opens an org library read-only', async () => {
    const token = await t.token();
    const lib = Project.parse(
      (await http.get('/api/projects/libraries/model-risk-policy').auth(token, bearer).expect(200)).body,
    );
    expect(lib).toMatchObject({ readOnly: true, name: 'Model risk policy library' });
    expect(lib.sources).toHaveLength(3);
    await http.get('/api/projects/libraries/nope').auth(token, bearer).expect(404);
  });
});
