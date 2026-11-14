import type { DocBlock } from '@donovan/contracts';
import { artifactText, blocksAt, downloadName } from './artifact-view';

const blocks: DocBlock[] = [
  { type: 'heading', text: 'Plan' },
  { type: 'paragraph', text: 'Ship it.' },
  { type: 'heading', text: 'Rollback', since: 2 },
];

describe('artifact view', () => {
  it('shows a document as it was at each version, marking what that version added', () => {
    expect(blocksAt(blocks, 1).map((b) => b.type === 'heading' && b.text)).toEqual(['Plan', false]);
    expect(blocksAt(blocks, 2).map((b) => b.isNew)).toEqual([false, false, true]);
  });

  it('copies a document as Markdown', () => {
    expect(artifactText({ kind: 'Doc', blocks }, 2)).toBe('## Plan\n\nShip it.\n\n## Rollback');
  });

  it('downloads under a sensible name', () => {
    expect(downloadName({ name: 'Rollout note — v3.2', body: { kind: 'Doc', blocks } }).name).toBe(
      'Rollout note — v3.2.md',
    );
    expect(
      downloadName({
        name: 'eval.ipynb',
        body: { kind: 'Code', language: 'python', cells: [{ type: 'code', text: 'x' }] },
      }).name,
    ).toBe('eval.py');
  });
});
