import { ChatSummary, Insights } from '@donovan/contracts';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createTestApp, type TestApp } from './support/test-app.js';

describe('/api/insights', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  const bearer = { type: 'bearer' } as const;
  beforeAll(async () => {
    t = await createTestApp();
    http = request(t.app.getHttpServer());
  });
  afterAll(() => t.app.close());

  it("counts the workspace's questions, answers, models and tool calls from what's stored", async () => {
    const token = await t.token({ sub: `insights-${randomUUID()}` });
    const read = async () => Insights.parse((await http.get('/api/insights').auth(token, bearer).expect(200)).body);
    const kpi = (i: Insights, label: string) => i.kpis.find((k) => k.label === label)!.value;
    const model = (i: Insights, name: string) => i.byModel.find((m) => m.name === name)?.count ?? 0;
    const server = (i: Insights, name: string) => i.byServer.find((m) => m.name === name)?.count ?? 0;

    const before = await read();
    const chat = ChatSummary.parse(
      (await http.post('/api/chats').auth(token, bearer).send({ text: 'Prep' }).expect(201)).body,
    );
    await http
      .post(`/api/chats/${chat.id}/messages`)
      .auth(token, bearer)
      .send({ text: 'What should I prep for the meeting?', model: 'claude-haiku-4.5' })
      .expect(200);
    const after = await read();

    // Other tests may add to these at the same time, so each grows by at least this chat's share.
    expect(kpi(after, 'Questions') - kpi(before, 'Questions')).toBeGreaterThanOrEqual(1);
    expect(kpi(after, 'Answers') - kpi(before, 'Answers')).toBeGreaterThanOrEqual(1);
    expect(kpi(after, 'Tool calls') - kpi(before, 'Tool calls')).toBeGreaterThanOrEqual(2);
    expect(model(after, 'claude-haiku-4.5') - model(before, 'claude-haiku-4.5')).toBeGreaterThanOrEqual(1);
    expect(server(after, 'Calendar') - server(before, 'Calendar')).toBeGreaterThanOrEqual(1);
    expect(after.byModel.reduce((n, m) => n + m.share, 0)).toBeCloseTo(1, 5);
  });

  it('gives each counted figure its count for the 30 days before, and none for a running total', async () => {
    const token = await t.token({ sub: `insights-${randomUUID()}` });
    const i = Insights.parse((await http.get('/api/insights').auth(token, bearer).expect(200)).body);
    for (const k of i.kpis) {
      if (k.label === 'In the registry') expect(k.previous).toBeNull();
      else expect(k.previous).toEqual(expect.any(Number));
    }
  });
});
