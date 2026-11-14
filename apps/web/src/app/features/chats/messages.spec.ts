import type { AssistantMessage } from '@donovan/contracts';
import { plainText, workedLabel } from './messages';

const answer = (blocks: AssistantMessage['blocks'], durationMs = 8600): AssistantMessage => ({
  id: 'm',
  role: 'assistant',
  routing: [],
  blocks,
  durationMs,
  vote: null,
  at: new Date().toISOString(),
});

const tool = {
  type: 'tool',
  id: 't',
  name: 'read_file',
  server: 'Filesystem',
  status: 'done',
  summary: '',
  sensitivity: 'Internal',
  write: false,
  durationMs: 1,
  args: {},
  result: null,
} as const;

describe('workedLabel', () => {
  it('counts tool calls', () => {
    expect(workedLabel(answer([tool, tool, { type: 'text', text: 'x' }]))).toBe('Worked for 8.6s · 2 tool calls');
    expect(workedLabel(answer([tool], 1400))).toBe('Worked for 1.4s · 1 tool call');
    expect(workedLabel(answer([{ type: 'text', text: 'x' }], 2000))).toBe('Worked for 2.0s');
  });
});

describe('plainText', () => {
  it('keeps the words and leaves out tool calls', () => {
    const m = answer([{ type: 'text', text: 'Hello' }, tool, { type: 'list', items: ['a', 'b'] }]);
    expect(plainText(m)).toBe('Hello\n\n1. a\n2. b');
  });
});
