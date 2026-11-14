import { titleFrom } from './chats.service.js';

describe('titleFrom', () => {
  it('takes the first sentence', () => {
    expect(titleFrom('Summarize September intents. Then chart them.')).toBe('Summarize September intents.');
  });

  it('cuts a long first sentence at a word and marks it', () => {
    const t = titleFrom(
      'Compare the churn propensity models across every region and plan tier for the last quarter please',
    );
    expect(t.length).toBeLessThanOrEqual(61);
    expect(t.endsWith('…')).toBe(true);
    expect(t).not.toMatch(/\s…$/);
  });
});
