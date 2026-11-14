import type { AssistantMessage } from '@donovan/contracts';

/** "Worked for 8.6s · 3 tool calls" */
export function workedLabel(m: AssistantMessage): string {
  const tools = m.blocks.filter((b) => b.type === 'tool').length;
  const seconds = (m.durationMs / 1000).toFixed(1);
  return `Worked for ${seconds}s${tools ? ` · ${tools} tool call${tools > 1 ? 's' : ''}` : ''}`;
}

/** An answer as plain text, for Copy. */
export function plainText(m: AssistantMessage): string {
  return m.blocks
    .map((b) => {
      switch (b.type) {
        case 'text':
          return b.text;
        case 'list':
          return b.items.map((i, n) => `${n + 1}. ${i}`).join('\n');
        case 'code':
          return b.text;
        case 'table':
          return [b.columns, ...b.rows].map((r) => r.join('\t')).join('\n');
        case 'claims':
          return b.items.map((c) => `- ${c.text}`).join('\n');
        case 'skill':
          return `${b.name} ${b.version}: ${b.note}`;
        default:
          return '';
      }
    })
    .filter(Boolean)
    .join('\n\n');
}
