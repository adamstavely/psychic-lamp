import type { ArtifactBody, DocBlock } from '@donovan/contracts';

/** The words in an artifact, for search and for a card's preview. */
export function plainText(body: ArtifactBody): string {
  switch (body.kind) {
    case 'Doc':
      return body.blocks.map(docText).join('\n');
    case 'Code':
      return body.cells.map((c) => c.text).join('\n');
    case 'Data':
      return [body.columns.join(' '), ...body.rows.map((r) => r.join(' '))].join('\n');
  }
}

function docText(b: DocBlock): string {
  switch (b.type) {
    case 'heading':
    case 'paragraph':
      return b.text;
    case 'list':
      return b.items.join('\n');
    case 'table':
      return [b.columns, ...b.rows].map((r) => r.join(' ')).join('\n');
    case 'bars':
      return b.items.map((i) => `${i.label} ${i.value}`).join('\n');
    case 'facts':
      return b.rows.map(([k, v]) => `${k}: ${v}`).join('\n');
    case 'callout':
      return `${b.title}. ${b.text}`;
  }
}

/** The first couple of lines, cut at a word. */
export function preview(body: ArtifactBody, max = 180): string {
  const text = (body.kind === 'Data' ? body.raw : plainText(body)).replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 20))}…`;
}

/** Turns an uploaded file into an artifact body. Throws with a message a person can act on. */
export function parseUpload(name: string, content: string): ArtifactBody {
  const ext = name.toLowerCase().split('.').pop();
  if (ext === 'csv') return parseCsv(content);
  if (ext === 'json') return parseJson(content);
  return { kind: 'Doc', blocks: parseMarkdown(content) };
}

function parseMarkdown(text: string): DocBlock[] {
  const blocks: DocBlock[] = [];
  for (const chunk of text.replace(/\r\n/g, '\n').split(/\n{2,}/)) {
    const lines = chunk.split('\n').filter((l) => l.trim());
    if (lines.length === 0) continue;
    if (lines.length === 1 && /^#{1,6}\s/.test(lines[0]!))
      blocks.push({ type: 'heading', text: lines[0]!.replace(/^#+\s*/, '') });
    else if (lines.every((l) => /^\s*([-*]|\d+\.)\s/.test(l)))
      blocks.push({ type: 'list', items: lines.map((l) => l.replace(/^\s*([-*]|\d+\.)\s+/, '')) });
    else blocks.push({ type: 'paragraph', text: lines.join(' ') });
  }
  if (blocks.length === 0) throw new Error('That file has no text in it');
  return blocks;
}

function parseCsv(text: string): ArtifactBody {
  const rows = csvRows(text.trim());
  if (rows.length < 1 || rows[0]!.length === 0) throw new Error('That CSV has no header row');
  const [columns, ...data] = rows;
  return { kind: 'Data', format: 'csv', columns: columns!, rows: data, raw: text };
}

/** RFC 4180-ish: commas, quoted fields with "" escapes and line breaks inside quotes. */
export function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  row.push(field);
  rows.push(row);
  return rows;
}

function parseJson(text: string): ArtifactBody {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("That JSON doesn't parse");
  }
  const cell = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v));
  if (Array.isArray(value) && value.every((v) => v && typeof v === 'object' && !Array.isArray(v))) {
    const columns = [...new Set(value.flatMap((v) => Object.keys(v as object)))];
    if (columns.length === 0) throw new Error('That JSON array has no fields');
    return {
      kind: 'Data',
      format: 'json',
      columns,
      rows: value.map((v) => columns.map((c) => cell((v as Record<string, unknown>)[c] ?? ''))),
      raw: text,
    };
  }
  if (value && typeof value === 'object' && !Array.isArray(value))
    return {
      kind: 'Data',
      format: 'json',
      columns: ['key', 'value'],
      rows: Object.entries(value).map(([k, v]) => [k, cell(v)]),
      raw: text,
    };
  throw new Error('Upload a JSON object or an array of objects');
}
