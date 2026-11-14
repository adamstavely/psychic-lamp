import { calibrate } from './calibrated.js';

const sources = [
  { id: 's1', title: 'Model card', meta: 'PDF · 14 pages' },
  { id: 's2', title: 'Shadow results', meta: 'Sheet · 41k rows' },
];

describe('calibrate', () => {
  it('labels each statement by what backs it and checks an unbacked one first', () => {
    const { claims, checkpoint } = calibrate(
      [
        { text: 'v3.2 catches 11% more fraud', cite: ['s1', 's2'] },
        { text: '. The threshold is 0.97', cite: ['s1'] },
        { text: '. Risk Ops will sign off this week', cite: [] },
        { text: '.', cite: [] },
      ],
      sources,
    );
    expect(claims.map((c) => [c.text, c.kind, c.confidence])).toEqual([
      ['v3.2 catches 11% more fraud.', 'grounded', 'high'],
      ['The threshold is 0.97.', 'grounded', 'medium'],
      ['Risk Ops will sign off this week.', 'inferred', 'low'],
    ]);
    expect(claims[0]!.note).toBe('Also in Shadow results');
    expect(claims[2]!.source).toBeNull();
    expect(checkpoint).toBe('Before acting, check “Risk Ops will sign off this week”: no selected source says it.');
  });

  it('asks to confirm a claim with a single source when every claim is backed', () => {
    const { checkpoint } = calibrate(
      [
        { text: 'A', cite: ['s1', 's2'] },
        { text: '. B', cite: ['s2'] },
      ],
      sources,
    );
    expect(checkpoint).toBe('Before acting, confirm “B” in Shadow results, its only source.');
  });
});
