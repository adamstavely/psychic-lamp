import type { Attachment, BlockOf } from '@donovan/contracts';
import { calibrateReply } from './claims.js';
import { pickReply, withFiles } from './replies.js';

const claimsOf = (blocks: ReturnType<typeof calibrateReply>['blocks']) =>
  blocks.filter((b): b is BlockOf<'claims'> => b.type === 'claims').flatMap((b) => b.items);

describe('calibrateReply', () => {
  it("grounds what a tool returned in that tool, and leaves the answer's talk about itself unlabelled", () => {
    const reply = calibrateReply(pickReply('What should I prep for the meeting?', 'auto'), []);
    const claims = claimsOf(reply.blocks);
    expect(claims.length).toBeGreaterThan(0);
    expect(claims.every((c) => c.kind === 'grounded' && c.source?.publisher)).toBe(true);
    expect(claims.map((c) => c.topic)).toContain('Calendar · list_events');
    expect(claims.some((c) => /^(On it|I )/.test(c.text) || /:\.$/.test(c.text))).toBe(false);
    expect(claims[0]?.source?.publisher).toBe('Tool result');
  });

  it('grounds an answer with no tools in the file sent with the question', () => {
    const files: Attachment[] = [
      { artifactId: 'a', name: 'notes.md', tokens: 10 },
      { artifactId: 'b', name: 'rows.csv', tokens: 5 },
    ];
    const reply = calibrateReply(
      withFiles({ routing: [], blocks: [{ type: 'text', text: 'Revenue rose 4%. I checked twice.' }] }, files),
      files,
    );
    const [claim, ...rest] = claimsOf(reply.blocks);
    expect(rest).toEqual([]);
    expect(claim).toMatchObject({
      kind: 'grounded',
      text: 'Revenue rose 4%.',
      source: { title: 'notes.md' },
      note: 'Also sent: rows.csv',
    });
  });

  it("labels an unsupported statement as the model's own knowledge, with its cutoff", () => {
    const [claim] = claimsOf(
      calibrateReply({ routing: [], blocks: [{ type: 'list', items: ['Churn peaks in January'] }] }, []).blocks,
    );
    expect(claim).toMatchObject({ kind: 'model', text: 'Churn peaks in January.', source: null, cutoff: 'Early 2025' });
  });

  it('says so when an answer makes no claims, and gives every claim its own id', () => {
    const none = calibrateReply(pickReply('hello', 'auto'), []);
    expect(none.blocks.at(-1)).toEqual({
      type: 'text',
      text: 'Calibrated: this answer makes no factual claims to label.',
    });
    const a = claimsOf(calibrateReply(pickReply('prep for the meeting', 'auto'), []).blocks);
    const b = claimsOf(calibrateReply(pickReply('prep for the meeting', 'auto'), []).blocks);
    expect(new Set([...a, ...b].map((c) => c.id)).size).toBe(a.length + b.length);
  });
});
