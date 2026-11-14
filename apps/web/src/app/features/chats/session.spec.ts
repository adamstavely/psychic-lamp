import type { AssistantMessage, Claim, Message } from '@donovan/contracts';
import { chatArtifacts, chatSources, claimSummary, needsCheckpoint, routingSummary } from './session';

const at = new Date().toISOString();
const claim = (id: string, review: Claim['review']): Claim => ({
  id,
  kind: 'grounded',
  confidence: 'high',
  text: id,
  topic: 't',
  source: null,
  note: null,
  cutoff: null,
  review,
});
const answer = (blocks: AssistantMessage['blocks'], routing: AssistantMessage['routing'] = []): Message => ({
  id: Math.random().toString(),
  role: 'assistant',
  routing,
  blocks,
  durationMs: 1,
  vote: null,
  at,
});

describe('session panel helpers', () => {
  it('counts verdicts', () => {
    expect(claimSummary([claim('a', 'confirmed'), claim('b', 'disputed'), claim('c', null)])).toEqual({
      confirmed: 1,
      disputed: 1,
      unresolved: 1,
    });
  });

  it('keeps the latest version of each artifact', () => {
    const v1 = { type: 'artifact', artifactId: 'rfc', name: 'rfc.md', kind: 'Doc', meta: 'v1' } as const;
    const v2 = { ...v1, meta: 'v2' };
    expect(chatArtifacts([answer([v1]), answer([v2])]).map((a) => a.meta)).toEqual(['v2']);
  });

  it('lists each source once and summarises them', () => {
    const routes = chatSources([
      answer(
        [],
        [
          { kind: 'model', name: 'a' },
          { kind: 'server', name: 's' },
        ],
      ),
      answer(
        [],
        [
          { kind: 'model', name: 'a' },
          { kind: 'model', name: 'b' },
        ],
      ),
    ]);
    expect(routes).toHaveLength(3);
    expect(routingSummary(routes)).toBe('2 models · 1 server');
  });

  it('asks for a checkpoint only in Calibrated chats with two answers and none given', () => {
    const two = [answer([]), answer([])];
    expect(needsCheckpoint(true, two, 0)).toBe(true);
    expect(needsCheckpoint(true, two, 1)).toBe(false);
    expect(needsCheckpoint(false, two, 0)).toBe(false);
    expect(needsCheckpoint(true, [answer([])], 0)).toBe(false);
  });
});
