import { toCitedText } from './cited.js';

describe('toCitedText', () => {
  it('hangs each citation on the text before it, keeping only selected sources', () => {
    expect(toCitedText(['A', 1, 3, '. B', 2, '.'], new Set(['s1', 's2']))).toEqual([
      { text: 'A', cite: ['s1'] },
      { text: '. B', cite: ['s2'] },
      { text: '.', cite: [] },
    ]);
  });
});
