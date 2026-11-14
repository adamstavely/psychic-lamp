import { Chat, ProvenanceManifest } from '@donovan/contracts';
import request from 'supertest';
import { createTestApp, type TestApp } from './support/test-app.js';

describe('claims, checkpoints and export', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  const bearer = { type: 'bearer' } as const;
  beforeAll(async () => {
    t = await createTestApp();
    http = request(t.app.getHttpServer());
  });
  afterAll(() => t.app.close());

  const claim = (chat: Chat, id: string) =>
    chat.messages
      .flatMap((m) => (m.role === 'assistant' ? m.blocks : []))
      .flatMap((b) => (b.type === 'claims' ? b.items : []))
      .find((c) => c.id === id);

  it('keeps a verdict on a claim, changes it, and clears it', async () => {
    const token = await t.token();
    await http.put('/api/chats/supplier/claims/c4/review').auth(token, bearer).send({ review: 'disputed' }).expect(204);
    let chat = Chat.parse((await http.get('/api/chats/supplier').auth(token, bearer)).body);
    expect(claim(chat, 'c4')?.review).toBe('disputed');
    await http
      .put('/api/chats/supplier/claims/c4/review')
      .auth(token, bearer)
      .send({ review: 'confirmed' })
      .expect(204);
    await http
      .put('/api/chats/supplier/claims/c1/review')
      .auth(token, bearer)
      .send({ review: 'confirmed' })
      .expect(204);
    await http.put('/api/chats/supplier/claims/c4/review').auth(token, bearer).send({ review: null }).expect(204);
    chat = Chat.parse((await http.get('/api/chats/supplier').auth(token, bearer)).body);
    expect([claim(chat, 'c1')?.review, claim(chat, 'c4')?.review]).toEqual(['confirmed', null]);
    await http
      .put('/api/chats/supplier/claims/zz/review')
      .auth(token, bearer)
      .send({ review: 'confirmed' })
      .expect(404);
  });

  it('records a checkpoint and estimates the context window', async () => {
    const token = await t.token();
    await http
      .post('/api/chats/supplier/checkpoints')
      .auth(token, bearer)
      .send({ claimId: 'c4', method: 'Ask MP Materials IR for their 2027 schedule' })
      .expect(204);
    await http
      .post('/api/chats/supplier/checkpoints')
      .auth(token, bearer)
      .send({ claimId: 'c4', method: '' })
      .expect(400);
    const chat = Chat.parse((await http.get('/api/chats/supplier').auth(token, bearer)).body);
    expect(chat.checkpoints).toEqual([
      expect.objectContaining({ claimId: 'c4', method: 'Ask MP Materials IR for their 2027 schedule' }),
    ]);
    expect(chat.context.parts[0]!.label).toBe('System prompt · Calibrated analyst');
  });

  it('exports a provenance record with sources, verdicts and a hash of the turns', async () => {
    const token = await t.token({ name: 'Alex Morgan' });
    await http
      .put('/api/chats/supplier/claims/c2/review')
      .auth(token, bearer)
      .send({ review: 'confirmed' })
      .expect(204);
    const m = ProvenanceManifest.parse(
      (await http.get('/api/chats/supplier/export').auth(token, bearer).expect(200)).body,
    );
    expect(m.exportedBy).toBe('Alex Morgan');
    expect(m.sources.map((s) => s.label)).toContain('USGS Minerals Yearbook 2023 — Rare Earths');
    expect(m.claims.find((c) => c.id === 'c2')?.review).toBe('confirmed');
    expect(m.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(m.routing.map((r) => r.name)).toContain('Source reliability v1.8');
  });
});
