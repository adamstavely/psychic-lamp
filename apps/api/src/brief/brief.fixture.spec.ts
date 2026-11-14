import { Brief } from '@donovan/contracts';
import { briefFixture, wallClock } from './brief.fixture.js';

describe('briefFixture', () => {
  const now = new Date('2026-11-14T13:10:00Z');

  it('fits the Brief contract once state is applied', () => {
    const content = briefFixture(now, 'UTC');
    const brief = {
      ...content,
      needs: content.needs.map((n) => ({ ...n, done: false })),
      memos: content.memos.map((m) => ({ ...m, read: false })),
      seenUpdates: [],
    };
    expect(() => Brief.parse(brief)).not.toThrow();
  });

  it("puts the go/no-go at 2:00 PM on the reader's own clock and says so in the read", () => {
    const content = briefFixture(now, 'America/New_York');
    const goNoGo = content.meetings.find((m) => m.important)!;
    expect(goNoGo.start).toBe('2026-11-14T19:00:00.000Z');
    expect(content.read[0]).toContain('2:00 PM');
    expect(content.since).toBe('2026-11-13T23:12:00.000Z');
  });

  it('uses the date in the reader zone, not UTC', () => {
    // 01:00 UTC on the 15th is still the 14th in Los Angeles.
    const late = briefFixture(new Date('2026-11-15T01:00:00Z'), 'America/Los_Angeles');
    expect(late.meetings[0]!.start).toBe('2026-11-14T17:30:00.000Z');
  });

  it('handles zones ahead of UTC', () => {
    expect(wallClock(now, 'Asia/Tokyo', 0, 9, 0).toISOString()).toBe('2026-11-14T00:00:00.000Z');
  });

  it('has unique ids for every update', () => {
    const ids = briefFixture(now, 'UTC').accounts.flatMap((a) => a.updates.map((u) => u.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
