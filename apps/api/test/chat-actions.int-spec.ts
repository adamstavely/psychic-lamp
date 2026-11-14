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

  it('refuses an empty message', async () => {
    const token = await t.token();
    await http.post('/api/chats/rfc/messages').auth(token, bearer).send({ text: '   ' }).expect(400);
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
