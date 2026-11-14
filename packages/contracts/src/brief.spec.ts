import { describe, expect, it } from 'vitest';
import { BriefQuery, MemosRead, NeedDone } from './brief.js';

describe('BriefQuery', () => {
  it('defaults to UTC and accepts a real time zone', () => {
    expect(BriefQuery.parse({}).tz).toBe('UTC');
    expect(BriefQuery.parse({ tz: 'America/New_York' }).tz).toBe('America/New_York');
  });

  it('rejects a time zone that does not exist', () => {
    expect(() => BriefQuery.parse({ tz: 'Mars/Olympus' })).toThrow();
  });
});

describe('state changes', () => {
  it('need a value and nothing else', () => {
    expect(() => NeedDone.parse({})).toThrow();
    expect(() => NeedDone.parse({ done: true, extra: 1 })).toThrow();
    expect(() => MemosRead.parse({ ids: [] })).toThrow();
  });
});
