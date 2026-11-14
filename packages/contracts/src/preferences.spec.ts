import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES, Preferences, PreferencesPatch } from './preferences.js';

describe('Preferences', () => {
  it('fills every missing field with its default', () => {
    expect(Preferences.parse({ theme: 'dark' })).toEqual({ ...DEFAULT_PREFERENCES, theme: 'dark' });
  });

  it('defaults to the system theme and Assist', () => {
    expect(DEFAULT_PREFERENCES).toMatchObject({ theme: 'system', startMode: 'assist', railExpanded: true });
  });
});

describe('PreferencesPatch', () => {
  it('accepts a partial update', () => {
    expect(PreferencesPatch.parse({ railExpanded: false })).toEqual({ railExpanded: false });
  });

  it('rejects unknown fields and bad values', () => {
    expect(() => PreferencesPatch.parse({ fontSize: 14 })).toThrow();
    expect(() => PreferencesPatch.parse({ theme: 'blue' })).toThrow();
  });
});
