import { Block } from '@donovan/contracts';
import { SEED_CHATS } from './chats.fixture.js';

describe('SEED_CHATS', () => {
  it('has unique chat ids and only valid blocks', () => {
    expect(new Set(SEED_CHATS.map((c) => c.id)).size).toBe(SEED_CHATS.length);
    for (const chat of SEED_CHATS)
      for (const m of chat.messages)
        if (m.role === 'assistant') for (const b of m.blocks) expect(() => Block.parse(b)).not.toThrow();
  });

  it('pins exactly one chat and keeps intent only on Calibrated chats', () => {
    expect(SEED_CHATS.filter((c) => c.pinned).map((c) => c.id)).toEqual(['fraud']);
    for (const c of SEED_CHATS) expect(c.intent !== null).toBe(c.calibrated);
  });

  it('starts every chat with the person asking', () => {
    for (const c of SEED_CHATS) expect(c.messages[0]!.role).toBe('user');
  });
});
