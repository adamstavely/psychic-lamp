import type { Message } from '@donovan/contracts';
import { contextFor } from './context.js';

const at = new Date().toISOString();
const messages: Message[] = [
  { id: 'u1', role: 'user', text: 'x'.repeat(400), at },
  {
    id: 'a1',
    role: 'assistant',
    routing: [{ kind: 'model', name: 'claude-opus-4.1' }],
    blocks: [
      {
        type: 'tool',
        id: 't',
        name: 'search_docs',
        server: 'Docs',
        status: 'done',
        summary: '',
        sensitivity: 'Internal',
        write: false,
        durationMs: 1,
        args: {},
        result: 'y'.repeat(40),
      },
    ],
    durationMs: 1000,
    versions: [],
    version: 1,
    vote: null,
    at,
  },
];

describe('contextFor', () => {
  it('estimates each part of the latest answer and names its model', () => {
    const c = contextFor({ calibrated: true, project: 'Supplier risk', persona: 'balanced' }, messages);
    expect(c.model).toBe('claude-opus-4.1');
    expect(c.parts).toEqual([
      { label: 'System prompt · Calibrated analyst', tokens: 312 },
      { label: 'Project instructions · Supplier risk', tokens: 140 },
      { label: 'Prior exchanges · 1', tokens: 100 },
      { label: 'Retrieved · 1 sources', tokens: 1100 },
      { label: 'Tool results · 1', tokens: 170 },
    ]);
  });

  it('copes with a chat that has no answer yet', () => {
    expect(contextFor({ calibrated: false, project: null, persona: 'balanced' }, []).parts.map((p) => p.label)).toEqual(
      ['System prompt', 'Prior exchanges · 0'],
    );
  });
});
