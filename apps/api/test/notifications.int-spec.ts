import { Brief, Notification } from '@donovan/contracts';
import request from 'supertest';
import { z } from 'zod';
import { createTestApp, type TestApp } from './support/test-app.js';

const List = z.array(Notification);

describe('/api/notifications', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  const bearer = { type: 'bearer' } as const;
  beforeAll(async () => {
    t = await createTestApp();
    http = request(t.app.getHttpServer());
  });
  afterAll(() => t.app.close());

  it('lists waiting approvals, memos and updates, newest first', async () => {
    const token = await t.token();
    const list = List.parse((await http.get('/api/notifications').auth(token, bearer).expect(200)).body);
    const approvals = list.filter((n) => n.category === 'approvals');
    expect(approvals.map((n) => n.id).sort()).toEqual([
      'approval:fraud:t3',
      'approval:intents:i3',
      'approval:invoice:v2',
    ]);
    expect(list.filter((n) => n.category === 'memos')).toHaveLength(4);
    expect([...list].sort((a, b) => b.time.localeCompare(a.time))).toEqual(list);
  });

  it('an approval leaves the feed once it is decided', async () => {
    const token = await t.token();
    await http.post('/api/chats/invoice/tools/v2/decision').auth(token, bearer).send({ decision: 'deny' }).expect(201);
    const list = List.parse((await http.get('/api/notifications').auth(token, bearer)).body);
    expect(list.map((n) => n.id)).not.toContain('approval:invoice:v2');
  });

  it('reading a memo here marks it read in the Brief, and dismissing hides a notification', async () => {
    const token = await t.token();
    await http
      .post('/api/notifications/read')
      .auth(token, bearer)
      .send({ ids: ['memo:approval-tiers', 'approval:fraud:t3'] })
      .expect(204);
    const brief = Brief.parse((await http.get('/api/brief').auth(token, bearer)).body);
    expect(brief.memos.find((m) => m.id === 'approval-tiers')!.read).toBe(true);
    let list = List.parse((await http.get('/api/notifications').auth(token, bearer)).body);
    expect(list.find((n) => n.id === 'approval:fraud:t3')!.read).toBe(true);
    await http.post('/api/notifications/dismiss').auth(token, bearer).send({ id: 'update:mara-1' }).expect(204);
    list = List.parse((await http.get('/api/notifications').auth(token, bearer)).body);
    expect(list.map((n) => n.id)).not.toContain('update:mara-1');
  });
});
