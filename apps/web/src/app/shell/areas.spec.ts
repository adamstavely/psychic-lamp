import { areaFor } from './areas';

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
