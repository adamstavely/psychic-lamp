import type { BlockOf, Claim } from '@donovan/contracts';
import { claimsFor, planSteps, tableFor, toolStatus } from './blocks';

const claim = (id: string, more: Partial<Claim> = {}): Claim => ({
  id,
  kind: 'grounded',
  confidence: 'high',
  text: `Claim ${id}.`,
  topic: 't',
  source: null,
  note: null,
  cutoff: null,
  review: null,
  ...more,
});

describe('block mappings', () => {
  it('maps tool statuses onto the three Trench Coat knows', () => {
    expect([toolStatus('done'), toolStatus('pending'), toolStatus('running'), toolStatus('denied')]).toEqual([
      'success',
      'running',
      'running',
      'error',
    ]);
  });

  it('keys table cells by column and gives rows ids', () => {
    const t = tableFor({ type: 'table', columns: ['Metric', 'v1'], rows: [['AUC', '0.89']] });
    expect(t.columns.map((c) => c.label)).toEqual(['Metric', 'v1']);
    expect(t.rows).toEqual([{ id: 'r0', c0: 'AUC', c1: '0.89' }]);
  });

  it('turns claims into spaced sentences with their sources and notes', () => {
    const block: BlockOf<'claims'> = {
      type: 'claims',
      items: [
        claim('a', {
          source: { title: 'USGS', publisher: 'US Geological Survey', match: 'Strong match', passage: 'p' },
        }),
        claim('b', { kind: 'model', confidence: 'low', cutoff: 'Early 2025', note: 'Verify it.' }),
      ],
    };
    const { claims, sources } = claimsFor(block);
    expect(claims.map((c) => c.text)).toEqual(['Claim a.', ' Claim b.']);
    expect(claims[0]).toMatchObject({
      source: 'grounded',
      confidence: 0.9,
      sources: ['a-source'],
      note: 'Strong match',
    });
    expect(claims[1]).toMatchObject({
      source: 'model',
      confidence: 0.3,
      note: 'Verify it. · Knowledge cutoff: Early 2025',
    });
    expect(sources).toEqual([{ id: 'a-source', title: 'USGS', site: 'US Geological Survey', quote: 'p' }]);
  });

  it('shows awaiting steps as the active one', () => {
    const steps = planSteps({
      type: 'steps',
      title: 'Plan',
      items: [
        { label: 'a', status: 'done' },
        { label: 'b', status: 'awaiting' },
      ],
    });
    expect(steps.map((s) => s.status)).toEqual(['done', 'active']);
  });
});
