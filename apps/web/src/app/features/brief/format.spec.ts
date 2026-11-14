import { greeting, initials, needsLine, relativeDay, sinceLine } from './format';

describe('brief formatting', () => {
  const now = new Date(2026, 10, 14, 9, 30);

  it('greets by the time of day', () => {
    expect(greeting(new Date(2026, 10, 14, 8))).toBe('Good morning');
    expect(greeting(new Date(2026, 10, 14, 13))).toBe('Good afternoon');
    expect(greeting(new Date(2026, 10, 14, 19))).toBe('Good evening');
  });

  it('counts what needs the reader', () => {
    expect(needsLine(4)).toBe('4 items need you today.');
    expect(needsLine(1)).toBe('1 item needs you today.');
    expect(needsLine(0)).toBe('Nothing needs you today.');
  });

  it('writes times relative to today', () => {
    expect(relativeDay(new Date(2026, 10, 14, 7, 2).toISOString(), now, 'en-US')).toBe('7:02 AM');
    expect(relativeDay(new Date(2026, 10, 13, 21, 40).toISOString(), now, 'en-US')).toBe('Yesterday 9:40 PM');
    expect(sinceLine(new Date(2026, 10, 13, 18, 12).toISOString(), now, 'en-US')).toBe(
      'Since you signed off yesterday at 6:12 PM',
    );
  });

  it('makes initials from the first and last name', () => {
    expect(initials('Mara Lindqvist')).toBe('ML');
    expect(initials('Platform Security')).toBe('PS');
  });
});
