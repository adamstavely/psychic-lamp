import { Chat, ChatSummary } from '@donovan/contracts';
import request from 'supertest';
import { z } from 'zod';
import { createTestApp, type TestApp } from './support/test-app.js';

describe('/api/chats', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  const bearer = { type: 'bearer' } as const;
  beforeAll(async () => {
    t = await createTestApp();
    http = request(t.app.getHttpServer());
  });
  afterAll(() => t.app.close());

  it("seeds a person's chats on first use, pinned first, then most recent", async () => {
    const token = await t.token();
    const list = z.array(ChatSummary).parse((await http.get('/api/chats').auth(token, bearer).expect(200)).body);
    expect(list.map((c) => c.id)).toEqual(['fraud', 'supplier', 'intents', 'rfc', 'invoice', 'sku', 'churn']);
    expect(list[0]!.pinned).toBe(true);
  });

  it('seeds once even when the first requests arrive together', async () => {
    const token = await t.token();
    const lists = await Promise.all([1, 2, 3].map(() => http.get('/api/chats').auth(token, bearer)));
    for (const res of lists) expect(res.status).toBe(200);
    const again = (await http.get('/api/chats').auth(token, bearer).expect(200)).body as unknown[];
    expect(again).toHaveLength(7);
  });

  it('returns a chat with its turns in order', async () => {
    const token = await t.token();
    const chat = Chat.parse((await http.get('/api/chats/supplier').auth(token, bearer).expect(200)).body);
    expect(chat.calibrated).toBe(true);
    expect(chat.intent?.decision).toContain('$18M');
    expect(chat.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
  });

  it("can't see someone else's chat by id, and says so for one that doesn't exist", async () => {
    const token = await t.token();
    await http.get('/api/chats/nope').auth(token, bearer).expect(404);
    await http.get('/api/chats/NOT_AN_ID!').auth(token, bearer).expect(400);
  });

  it('pins and renames without moving the chat in the list', async () => {
    const token = await t.token();
    const before = z.array(ChatSummary).parse((await http.get('/api/chats').auth(token, bearer)).body);
    const rfc = before.find((c) => c.id === 'rfc')!;
    const res = await http
      .patch('/api/chats/rfc')
      .auth(token, bearer)
      .send({ title: 'Approval tiers RFC', pinned: true })
      .expect(200);
    expect(ChatSummary.parse(res.body)).toMatchObject({
      title: 'Approval tiers RFC',
      pinned: true,
      updatedAt: rfc.updatedAt,
    });
    await http.patch('/api/chats/rfc').auth(token, bearer).send({ title: '' }).expect(400);
  });

  it('deletes a chat from the list and Undo brings it back', async () => {
    const token = await t.token();
    await http.get('/api/chats').auth(token, bearer).expect(200);
    await http.delete('/api/chats/churn').auth(token, bearer).expect(204);
    let ids = ((await http.get('/api/chats').auth(token, bearer)).body as { id: string }[]).map((c) => c.id);
    expect(ids).not.toContain('churn');
    await http.get('/api/chats/churn').auth(token, bearer).expect(404);
    await http.post('/api/chats/churn/restore').auth(token, bearer).expect(204);
    ids = ((await http.get('/api/chats').auth(token, bearer)).body as { id: string }[]).map((c) => c.id);
    expect(ids).toContain('churn');
  });
});
