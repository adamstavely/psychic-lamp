import type { Artifact, ArtifactBody, DocBlock } from '@donovan/contracts';

export type ShownBlock = DocBlock & { isNew: boolean };

/** A document as it stood at `version`: later blocks left out, and the ones that version added marked new. */
export function blocksAt(blocks: DocBlock[], version: number): ShownBlock[] {
  return blocks
    .filter((b) => (b.since ?? 1) <= version)
    .map((b) => ({ ...b, isNew: version > 1 && (b.since ?? 1) === version }));
}

/** The artifact as text, for Copy and Download: Markdown for documents, the source for code and data. */
export function artifactText(body: ArtifactBody, version: number): string {
  switch (body.kind) {
    case 'Data':
      return body.raw;
    case 'Code':
      return body.cells
        .map((c) =>
          c.type === 'code'
            ? c.text
            : c.type === 'markdown'
              ? `# ${c.text.replace(/\n/g, '\n# ')}`
              : `# Output:\n# ${c.text.replace(/\n/g, '\n# ')}`,
        )
        .join('\n\n');
    case 'Doc':
      return blocksAt(body.blocks, version).map(markdown).join('\n\n');
  }
}

function markdown(b: DocBlock): string {
  switch (b.type) {
    case 'heading':
      return `## ${b.text}`;
    case 'paragraph':
      return b.text;
    case 'list':
      return b.items.map((i) => `- ${i}`).join('\n');
    case 'table':
      return [b.columns, b.columns.map(() => '---'), ...b.rows].map((r) => `| ${r.join(' | ')} |`).join('\n');
    case 'bars':
      return b.items.map((i) => `- ${i.label}: ${i.value.toLocaleString('en-US')}`).join('\n');
    case 'facts':
      return b.rows.map(([k, v]) => `**${k}:** ${v}`).join('\n');
    case 'callout':
      return `> **${b.title}** ${b.text}`;
  }
}

/** A file name and type to download it as. */
export function downloadName(a: Pick<Artifact, 'name' | 'body'>): { name: string; type: string } {
  if (a.body.kind === 'Data') return { name: a.name, type: a.body.format === 'csv' ? 'text/csv' : 'application/json' };
  if (a.body.kind === 'Code') return { name: a.name.replace(/\.ipynb$/, '.py'), type: 'text/x-python' };
  return {
    name: /\.(md|markdown|txt)$/i.test(a.name) ? a.name : `${a.name.replace(/[\\/:*?"<>|]/g, '-')}.md`,
    type: 'text/markdown',
  };
}
