import type { AssistantMessage, StreamEvent } from '@donovan/contracts';
import { sse, streamAnswer } from './stream.js';

const answer: AssistantMessage = {
  id: 'a1',
  role: 'assistant',
  routing: [{ kind: 'model', name: 'claude-sonnet-4.5' }],
  blocks: [
    {
      type: 'tool',
      id: 't',
      name: 'query',
      server: 'Postgres',
      status: 'done',
      summary: 's',
      sensitivity: 'Internal',
      write: false,
      durationMs: 900,
      args: {},
      result: 'r',
    },
    { type: 'text', text: 'Two words.' },
  ],
  durationMs: 3000,
  versions: [],
  version: 1,
  vote: null,
  at: new Date().toISOString(),
};

async function collect(signal = new AbortController().signal): Promise<StreamEvent[]> {
  const out: StreamEvent[] = [];
  for await (const e of streamAnswer(answer, 0, signal)) out.push(e);
  return out;
}

describe('streamAnswer', () => {
  it('runs tools before finishing them, writes text a word at a time, then ends with the answer', async () => {
    const events = await collect();
    expect(events.map((e) => e.type)).toEqual(['start', 'block', 'block', 'block', 'delta', 'delta', 'done']);
    expect(events[1]).toMatchObject({ block: { status: 'running', result: null } });
    expect(events[2]).toMatchObject({ block: { status: 'done', result: 'r' } });
    const text = events
      .filter((e) => e.type === 'delta')
      .map((e) => (e.type === 'delta' ? e.text : ''))
      .join('');
    expect(text).toBe('Two words.');
  });

  it('stops when the reader leaves', async () => {
    const c = new AbortController();
    c.abort();
    expect((await collect(c.signal)).map((e) => e.type)).toEqual(['start']);
  });

  it('formats server-sent events', () => {
    expect(sse({ type: 'error', message: 'x' })).toBe('event: error\ndata: {"type":"error","message":"x"}\n\n');
  });
});
