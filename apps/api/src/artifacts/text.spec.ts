import { csvRows, parseUpload, preview } from './text.js';

describe('uploads', () => {
  it('reads Markdown into headings, lists and paragraphs', () => {
    expect(parseUpload('notes.md', '# Plan\n\nShip it\non Friday.\n\n- one\n- two')).toEqual({
      kind: 'Doc',
      blocks: [
        { type: 'heading', text: 'Plan' },
        { type: 'paragraph', text: 'Ship it on Friday.' },
        { type: 'list', items: ['one', 'two'] },
      ],
    });
  });

  it('reads CSV with quotes, and JSON objects or arrays of objects', () => {
    expect(csvRows('a,b\n"x, y","say ""hi"""')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
    ]);
    expect(parseUpload('k.json', '{"region":"EU","pct":10}')).toMatchObject({
      columns: ['key', 'value'],
      rows: [
        ['region', 'EU'],
        ['pct', '10'],
      ],
    });
    expect(parseUpload('r.json', '[{"a":1},{"b":2}]')).toMatchObject({
      columns: ['a', 'b'],
      rows: [
        ['1', ''],
        ['', '2'],
      ],
    });
  });

  it('says what is wrong with a file it cannot read', () => {
    expect(() => parseUpload('x.json', '{nope')).toThrow("That JSON doesn't parse");
    expect(() => parseUpload('x.json', '42')).toThrow('Upload a JSON object or an array of objects');
    expect(() => parseUpload('x.md', '\n\n')).toThrow('That file has no text in it');
  });
});

describe('preview', () => {
  it('cuts at a word', () => {
    const p = preview({ kind: 'Doc', blocks: [{ type: 'paragraph', text: 'word '.repeat(80) }] }, 40);
    expect(p.endsWith('…')).toBe(true);
    expect(p.length).toBeLessThanOrEqual(41);
  });
});
