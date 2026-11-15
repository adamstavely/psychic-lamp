import { Chat, ChatSummary, StreamEvent, ToolDecisionResult } from '@donovan/contracts';
import request from 'supertest';
import { createTestApp, type TestApp } from './support/test-app.js';

/** The events in a server-sent-events body, in order. */
function events(body: string): StreamEvent[] {
  return body
    .split('\n\n')
    .filter(Boolean)
    .map((chunk) =>
      StreamEvent.parse(
        JSON.parse(
          chunk
            .split('\n')
            .find((l) => l.startsWith('data: '))!
            .slice(6),
        ),
      ),
    );
}

describe('sending, approving and voting', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  const bearer = { type: 'bearer' } as const;
  beforeAll(async () => {
    t = await createTestApp();
    http = request(t.app.getHttpServer());
  });
  afterAll(() => t.app.close());

  it('starts a chat titled from its first message and streams the answer', async () => {
    const token = await t.token();
    const created = ChatSummary.parse(
      (
        await http
          .post('/api/chats')
          .auth(token, bearer)
          .send({ text: 'What should I prep for the 2:00 PM meeting? Thanks' })
          .expect(201)
      ).body,
    );
    expect(created.title).toBe('What should I prep for the 2:00 PM meeting?');

    const res = await http
      .post(`/api/chats/${created.id}/messages`)
      .auth(token, bearer)
      .send({ text: 'What should I prep for the 2:00 PM meeting?' })
      .expect(200)
      .expect('Content-Type', /text\/event-stream/);
    const stream = events(res.text);
    expect(stream[0]).toMatchObject({ type: 'user', message: { role: 'user' } });
    expect(stream[1]).toMatchObject({ type: 'start' });
    expect(stream.at(-1)).toMatchObject({ type: 'done' });
    expect(stream.some((e) => e.type === 'block' && e.block.type === 'tool' && e.block.status === 'running')).toBe(
      true,
    );

    const chat = Chat.parse((await http.get(`/api/chats/${created.id}`).auth(token, bearer)).body);
    expect(chat.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    const done = stream.at(-1)!;
    expect(chat.messages[1]).toEqual(done.type === 'done' ? done.message : null);
  });

  it('pins the answer to a chosen model', async () => {
    const token = await t.token();
    const res = await http
      .post('/api/chats/rfc/messages')
      .auth(token, bearer)
      .send({ text: 'Thanks!', model: 'claude-opus-4.1' });
    const start = events(res.text).find((e) => e.type === 'start');
    expect(start).toMatchObject({ routing: [{ kind: 'model', name: 'claude-opus-4.1' }] });
  });

  it('takes ten sends to one chat at once, each saved once and in order', async () => {
    const token = await t.token();
    const created = ChatSummary.parse(
      (await http.post('/api/chats').auth(token, bearer).send({ text: 'Start' }).expect(201)).body,
    );
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        http
          .post(`/api/chats/${created.id}/messages`)
          .auth(token, bearer)
          .send({ text: `Message ${i}` }),
      ),
    );
    expect(results.map((r) => r.status)).toEqual(Array(10).fill(200));
    const chat = Chat.parse((await http.get(`/api/chats/${created.id}`).auth(token, bearer).expect(200)).body);
    const asked = chat.messages.filter((m) => m.role === 'user').map((m) => (m.role === 'user' ? m.text : ''));
    expect(asked.filter((t) => t.startsWith('Message ')).sort()).toEqual(
      Array.from({ length: 10 }, (_, i) => `Message ${i}`).sort(),
    );
    // Each question is followed by its own answer.
    chat.messages.forEach((m, i) => expect(m.role).toBe(i % 2 === 0 ? 'user' : 'assistant'));
  });

  it('saves a retried send once, and returns the turn it saved', async () => {
    const token = await t.token();
    const created = ChatSummary.parse(
      (await http.post('/api/chats').auth(token, bearer).send({ text: 'Start' }).expect(201)).body,
    );
    const requestId = '7d3c2f0e-4a1b-4c5d-8e9f-0a1b2c3d4e5f';
    const send = () =>
      http.post(`/api/chats/${created.id}/messages`).auth(token, bearer).send({ text: 'Once only', requestId });
    const [first, again] = [await send(), await send()];
    const userOf = (text: string) => events(text).find((e) => e.type === 'user') as { message: { id: string } };
    expect(userOf(again.text).message.id).toBe(userOf(first.text).message.id);
    const chat = Chat.parse((await http.get(`/api/chats/${created.id}`).auth(token, bearer).expect(200)).body);
    const saved = chat.messages.filter((m) => m.role === 'user' && m.text === 'Once only');
    // Under the id it was sent with, so the app can see a send it wasn't sure of did arrive.
    expect(saved).toEqual([expect.objectContaining({ requestId })]);
  });

  it('refuses an empty message', async () => {
    const token = await t.token();
    await http.post('/api/chats/rfc/messages').auth(token, bearer).send({ text: '   ' }).expect(400);
  });

  it('sends files with a message: the answer reads them, and the chat keeps them and counts them in context', async () => {
    const token = await t.token();
    const upload = (name: string, content: string) =>
      http.post('/api/artifacts').auth(token, bearer).send({ name, content }).expect(201);
    const notes = (await upload('notes.md', '# Notes\n\nShip on Friday.')).body as { id: string };
    const data = (await upload('rows.csv', 'a,b\n1,2')).body as { id: string };
    const created = ChatSummary.parse(
      (await http.post('/api/chats').auth(token, bearer).send({ text: 'Read these' }).expect(201)).body,
    );

    const res = await http
      .post(`/api/chats/${created.id}/messages`)
      .auth(token, bearer)
      .send({ text: 'Read these', attachments: [notes.id, data.id] })
      .expect(200);
    const done = events(res.text).at(-1);
    expect(done).toMatchObject({ type: 'done' });
    const first = done?.type === 'done' ? done.message.blocks[0] : null;
    expect(first).toMatchObject({ type: 'text', text: expect.stringMatching(/^I read notes\.md and rows\.csv/) });

    const chat = Chat.parse((await http.get(`/api/chats/${created.id}`).auth(token, bearer)).body);
    const asked = chat.messages[0]!;
    expect(asked.role === 'user' && asked.attachments?.map((f) => f.name)).toEqual(['notes.md', 'rows.csv']);
    expect(chat.context.parts.find((p) => p.label === 'Attached · 2 files')?.tokens).toBeGreaterThan(0);
  });

  it("refuses to attach an artifact that isn't the sender's", async () => {
    const owner = await t.token({ sub: 'attach-owner' });
    const other = await t.token({ sub: 'attach-other' });
    const theirs = (
      await http.post('/api/artifacts').auth(owner, bearer).send({ name: 'secret.txt', content: 'x' }).expect(201)
    ).body as { id: string };
    const chat = ChatSummary.parse(
      (await http.post('/api/chats').auth(other, bearer).send({ text: 'Hi' }).expect(201)).body,
    );
    await http
      .post(`/api/chats/${chat.id}/messages`)
      .auth(other, bearer)
      .send({ text: 'Read it', attachments: [theirs.id] })
      .expect(400);
    const after = Chat.parse((await http.get(`/api/chats/${chat.id}`).auth(other, bearer)).body);
    expect(after.messages).toEqual([]);
  });

  it('starts a chat Calibrated, labels its answers, takes an intent, and turns it off for later answers', async () => {
    const token = await t.token({ sub: 'calibrated-chat' });
    const ask = async (id: string) =>
      events(
        (
          await http
            .post(`/api/chats/${id}/messages`)
            .auth(token, bearer)
            .send({ text: 'What should I prep for the meeting?' })
            .expect(200)
        ).text,
      ).at(-1);
    const hasClaims = (e: StreamEvent | undefined) =>
      e?.type === 'done' && e.message.blocks.some((b) => b.type === 'claims');

    const created = ChatSummary.parse(
      (await http.post('/api/chats').auth(token, bearer).send({ text: 'Prep', calibrated: true }).expect(201)).body,
    );
    expect(created.calibrated).toBe(true);
    expect(hasClaims(await ask(created.id))).toBe(true);

    const intent = { task: 'Prep the go/no-go', decision: 'Ship or hold', consequence: 'A bad rollout' };
    await http.patch(`/api/chats/${created.id}`).auth(token, bearer).send({ intent }).expect(200);
    await http
      .patch(`/api/chats/${created.id}`)
      .auth(token, bearer)
      .send({ intent: { ...intent, task: ' ' } })
      .expect(400);
    await http.patch(`/api/chats/${created.id}`).auth(token, bearer).send({ calibrated: false }).expect(200);
    expect(hasClaims(await ask(created.id))).toBe(false);

    const chat = Chat.parse((await http.get(`/api/chats/${created.id}`).auth(token, bearer)).body);
    expect(chat).toMatchObject({ calibrated: false, intent });
    // Answers given while it was Calibrated keep their labels.
    expect(
      chat.messages.filter((m) => m.role === 'assistant' && m.blocks.some((b) => b.type === 'claims')),
    ).toHaveLength(1);
  });

  it('approves a waiting write tool once, then refuses a second decision', async () => {
    const token = await t.token();
    const result = ToolDecisionResult.parse(
      (
        await http
          .post('/api/chats/fraud/tools/t3/decision')
          .auth(token, bearer)
          .send({ decision: 'approve', always: true })
          .expect(201)
      ).body,
    );
    const tool = result.updated.blocks.find((b) => b.type === 'tool' && b.id === 't3');
    expect(tool).toMatchObject({ status: 'done' });
    expect(result.reply.blocks[0]).toMatchObject({ type: 'text', text: expect.stringContaining('post_message ran') });
    await http.post('/api/chats/fraud/tools/t3/decision').auth(token, bearer).send({ decision: 'deny' }).expect(409);

    const chat = Chat.parse((await http.get('/api/chats/fraud').auth(token, bearer)).body);
    expect(chat.messages.at(-1)!.id).toBe(result.reply.id);
  });

  it('takes one of two decisions made at once on a waiting tool, and refuses the other', async () => {
    // A fresh person (and seeded chat) each round: the race is about timing, so give it several chances.
    for (const second of ['approve', 'deny', 'approve', 'deny', 'approve'] as const) {
      const token = await t.token();
      const before = Chat.parse((await http.get('/api/chats/fraud').auth(token, bearer).expect(200)).body);
      const results = await Promise.all(
        [{ decision: 'approve' }, { decision: second }].map((body) =>
          http.post('/api/chats/fraud/tools/t3/decision').auth(token, bearer).send(body),
        ),
      );
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      const after = Chat.parse((await http.get('/api/chats/fraud').auth(token, bearer).expect(200)).body);
      // One reply to one decision.
      expect(after.messages).toHaveLength(before.messages.length + 1);
    }
  });

  it('denies a write tool, and knows unknown ones', async () => {
    const token = await t.token();
    const result = ToolDecisionResult.parse(
      (
        await http
          .post('/api/chats/invoice/tools/v2/decision')
          .auth(token, bearer)
          .send({ decision: 'deny' })
          .expect(201)
      ).body,
    );
    expect(result.updated.blocks.find((b) => b.type === 'tool' && b.id === 'v2')).toMatchObject({ status: 'denied' });
    await http
      .post('/api/chats/invoice/tools/nope/decision')
      .auth(token, bearer)
      .send({ decision: 'deny' })
      .expect(404);
  });

  it('records and clears a vote on an answer', async () => {
    const token = await t.token();
    const chat = Chat.parse((await http.get('/api/chats/churn').auth(token, bearer)).body);
    const answer = chat.messages.find((m) => m.role === 'assistant')!;
    await http
      .put(`/api/chats/churn/messages/${answer.id}/vote`)
      .auth(token, bearer)
      .send({ vote: 'down', reason: 'Not accurate' })
      .expect(204);
    let again = Chat.parse((await http.get('/api/chats/churn').auth(token, bearer)).body);
    expect(again.messages.find((m) => m.id === answer.id)).toMatchObject({ vote: 'down' });
    await http.put(`/api/chats/churn/messages/${answer.id}/vote`).auth(token, bearer).send({ vote: null }).expect(204);
    again = Chat.parse((await http.get('/api/chats/churn').auth(token, bearer)).body);
    expect(again.messages.find((m) => m.id === answer.id)).toMatchObject({ vote: null });
  });
});

describe('regenerating an answer', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  const bearer = { type: 'bearer' } as const;
  beforeAll(async () => {
    t = await createTestApp();
    http = request(t.app.getHttpServer());
  });
  afterAll(() => t.app.close());

  it('streams a new version, shows it, and can go back to the first', async () => {
    const token = await t.token();
    const chat = Chat.parse((await http.get('/api/chats/churn').auth(token, bearer)).body);
    const answer = chat.messages.find((m) => m.role === 'assistant')!;
    const res = await http
      .post(`/api/chats/churn/messages/${answer.id}/regenerate`)
      .auth(token, bearer)
      .send({})
      .expect(200);
    const stream = events(res.text);
    expect(stream[0]).toMatchObject({ type: 'start', id: answer.id });
    const done = stream.at(-1)!;
    expect(done).toMatchObject({ type: 'done', message: { id: answer.id, version: 2 } });
    if (done.type !== 'done') throw new Error('no answer');
    expect(done.message.versions).toHaveLength(2);
    expect(done.message.blocks).not.toEqual(done.message.versions[0]!.blocks);

    await http
      .put(`/api/chats/churn/messages/${answer.id}/version`)
      .auth(token, bearer)
      .send({ version: 1 })
      .expect(204);
    const again = Chat.parse((await http.get('/api/chats/churn').auth(token, bearer)).body);
    const shown = again.messages.find((m) => m.id === answer.id);
    expect(shown).toMatchObject({ version: 1 });
    if (shown?.role !== 'assistant') throw new Error('no answer');
    expect(shown.blocks).toEqual(shown.versions[0]!.blocks);
    await http
      .put(`/api/chats/churn/messages/${answer.id}/version`)
      .auth(token, bearer)
      .send({ version: 9 })
      .expect(404);
  });

  it('keeps every version when regenerations arrive together', async () => {
    const token = await t.token();
    const chat = Chat.parse((await http.get('/api/chats/churn').auth(token, bearer)).body);
    const answer = chat.messages.find((m) => m.role === 'assistant')!;
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        http.post(`/api/chats/churn/messages/${answer.id}/regenerate`).auth(token, bearer).send({}),
      ),
    );
    expect(results.map((r) => r.status)).toEqual(Array(6).fill(200));
    const again = Chat.parse((await http.get('/api/chats/churn').auth(token, bearer)).body);
    const after = again.messages.find((m) => m.id === answer.id);
    if (after?.role !== 'assistant') throw new Error('no answer');
    expect(after.versions).toHaveLength(7);
  });

  it('loses no version when one is shown while others are made', async () => {
    const token = await t.token();
    const chat = Chat.parse((await http.get('/api/chats/churn').auth(token, bearer)).body);
    const answer = chat.messages.find((m) => m.role === 'assistant')!;
    const url = `/api/chats/churn/messages/${answer.id}`;
    const results = await Promise.all([
      http.post(`${url}/regenerate`).auth(token, bearer).send({}),
      http.put(`${url}/version`).auth(token, bearer).send({ version: 1 }),
      http.post(`${url}/regenerate`).auth(token, bearer).send({}),
      http.put(`${url}/version`).auth(token, bearer).send({ version: 1 }),
      http.post(`${url}/regenerate`).auth(token, bearer).send({}),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 204, 200, 204, 200]);
    const again = Chat.parse((await http.get('/api/chats/churn').auth(token, bearer)).body);
    const after = again.messages.find((m) => m.id === answer.id);
    if (after?.role !== 'assistant') throw new Error('no answer');
    expect(after.versions).toHaveLength(4);
  });

  it('keeps a decision in the version it was made in', async () => {
    const token = await t.token();
    await http.post('/api/chats/invoice/tools/v2/decision').auth(token, bearer).send({ decision: 'deny' }).expect(201);
    const chat = Chat.parse((await http.get('/api/chats/invoice').auth(token, bearer)).body);
    const withTool = chat.messages.find(
      (m) => m.role === 'assistant' && m.blocks.some((b) => b.type === 'tool' && b.id === 'v2'),
    );
    if (withTool?.role !== 'assistant') throw new Error('no answer');
    expect(withTool.versions[0]!.blocks.find((b) => b.type === 'tool')).toMatchObject({ status: 'denied' });
  });
});
