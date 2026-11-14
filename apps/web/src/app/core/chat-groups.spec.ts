import type { ChatSummary } from '@donovan/contracts';
import { groupChats } from './chat-groups';

const chat = (id: string, updatedAt: Date, pinned = false): ChatSummary => ({
  id,
  title: id,
  project: null,
  sensitivity: 'Internal',
  pinned,
  calibrated: false,
  updatedAt: updatedAt.toISOString(),
});

describe('groupChats', () => {
  const now = new Date(2026, 10, 14, 15, 0);

  it('puts pinned first, then today, yesterday, this week and older, newest first within each', () => {
    const groups = groupChats(
      [
        chat('old', new Date(2026, 10, 1)),
        chat('mon', new Date(2026, 10, 10, 9)),
        chat('pin', new Date(2026, 10, 2), true),
        chat('yday', new Date(2026, 10, 13, 22)),
        chat('am', new Date(2026, 10, 14, 9)),
        chat('noon', new Date(2026, 10, 14, 12)),
      ],
      now,
    );
    expect(groups.map((g) => [g.label, g.chats.map((c) => c.id)])).toEqual([
      ['Pinned', ['pin']],
      ['Today', ['noon', 'am']],
      ['Yesterday', ['yday']],
      ['Earlier this week', ['mon']],
      ['Older', ['old']],
    ]);
  });

  it('leaves out empty groups', () => {
    expect(groupChats([chat('am', new Date(2026, 10, 14, 9))], now).map((g) => g.label)).toEqual(['Today']);
  });
});
