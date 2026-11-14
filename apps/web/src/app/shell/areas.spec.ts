import { areaFor, modeFor } from './areas';

describe('areaFor', () => {
  it('names the area from the first path segment', () => {
    expect(areaFor('/chats/fraud?pane=session')).toBe('chats');
    expect(areaFor('/brief')).toBe('brief');
  });

  it('is null outside the areas', () => {
    expect(areaFor('/')).toBeNull();
    expect(areaFor('/nowhere')).toBeNull();
  });
});

describe('Build addresses', () => {
  it('are Build mode, named by their second segment', () => {
    expect(modeFor('/build/servers/filesystem')).toBe('build');
    expect(modeFor('/build')).toBe('build');
    expect(areaFor('/build/servers/filesystem?tab=tools')).toBe('servers');
    expect(areaFor('/build/nowhere')).toBeNull();
  });

  it("aren't confused with Assist addresses that start the same", () => {
    expect(modeFor('/brief')).toBe('assist');
    expect(modeFor('/builder')).toBe('assist');
  });
});
