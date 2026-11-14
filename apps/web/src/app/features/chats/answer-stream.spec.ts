import { SseReader } from './answer-stream';

const ev = (type: string, extra: object = {}) => `event: ${type}\ndata: ${JSON.stringify({ type, ...extra })}\n\n`;

describe('SseReader', () => {
  it('returns each event once as the body grows, and waits for a whole event', () => {
    const r = new SseReader();
    const one = ev('start', { id: 'a' });
    const two = ev('delta', { index: 0, text: 'Hi' });
    expect(r.read(one + two.slice(0, 10)).map((e) => e.type)).toEqual(['start']);
    expect(r.read(one + two).map((e) => e.type)).toEqual(['delta']);
    expect(r.read(one + two)).toEqual([]);
  });
});
