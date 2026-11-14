import type { CitedText } from '@donovan/contracts';
import type { Cited } from '../seed/projects.fixture.js';

/** The source id for a project's source at a 1-based position. */
export const sourceId = (position: number) => `s${position}`;

/**
 * Turns the fixture's cited text (strings, with numbers citing the source at that position) into segments that cite
 * source ids, keeping only citations of sources that are selected and dropping any that point nowhere.
 */
export function toCitedText(cited: Cited, selected: ReadonlySet<string>): CitedText {
  const out: CitedText = [];
  for (const part of cited) {
    if (typeof part === 'string') out.push({ text: part, cite: [] });
    else {
      const id = sourceId(part);
      const last = out.at(-1);
      if (last && selected.has(id) && !last.cite.includes(id)) last.cite.push(id);
    }
  }
  return out;
}
