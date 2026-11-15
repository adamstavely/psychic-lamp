import type { Attachment, Block, BlockOf, Claim } from '@donovan/contracts';
import { randomBytes } from 'node:crypto';
import type { Reply } from './replies.js';

/** Where Donovan's general knowledge ends, for claims that rest on nothing else. */
const CUTOFF = 'Early 2025';

/**
 * A Calibrated chat's answer, with each statement in it labelled: grounded in what a tool returned or in a file sent
 * with the question, or else the model's own knowledge. Sentences about the answer itself ("I read…", "On it.") and
 * lead-ins to a list aren't claims and stay unlabelled. With no claims at all, the answer says so rather than showing an empty list.
 */
export function calibrateReply(reply: Reply, files: Attachment[]): Reply {
  const tools = reply.blocks.filter((b): b is BlockOf<'tool'> => b.type === 'tool' && !!b.result);
  const statements = reply.blocks.flatMap((b) =>
    b.type === 'text' ? sentences(b.text) : b.type === 'list' ? b.items : [],
  );
  const prefix = randomBytes(3).toString('hex');
  const claims = statements.filter(isClaim).map((text, i): Claim => {
    const id = `c-${prefix}-${i + 1}`;
    const file = files[0];
    const tool = tools[i % Math.max(tools.length, 1)];
    if (tool) return grounded(id, text, `${tool.server} · ${tool.name}`, 'Tool result', null, tool.result!);
    if (file)
      return grounded(id, text, file.name, 'Attached file', files.length > 1 ? `Also sent: ${others(files)}` : null);
    return {
      id,
      kind: 'model',
      confidence: 'medium',
      text: withStop(text),
      topic: 'Model knowledge',
      source: null,
      note: 'Nothing in this chat says this; it comes from what the model was trained on',
      cutoff: CUTOFF,
      review: null,
    };
  });
  const note: Block = claims.length
    ? { type: 'claims', items: claims }
    : { type: 'text', text: 'Calibrated: this answer makes no factual claims to label.' };
  return { ...reply, blocks: [...reply.blocks, note] };
}

function grounded(
  id: string,
  text: string,
  title: string,
  publisher: string,
  note: string | null,
  passage = text,
): Claim {
  return {
    id,
    kind: 'grounded',
    confidence: 'medium',
    text: withStop(text),
    topic: title,
    source: { title, publisher, match: 'Partial match', passage },
    note,
    cutoff: null,
    review: null,
  };
}

/** Statements about the answer itself, not the world. */
const ABOUT_THE_ANSWER =
  /^(on it|i |i'm|i've|i'll|here is|here's|looking at it again|a different angle|tell me|done:)/i;

/** A statement about the world: not talk about the answer, and not a lead-in to a list ("bring three things:"). */
function isClaim(text: string): boolean {
  const t = text.trim();
  return /\p{L}/u.test(t) && !ABOUT_THE_ANSWER.test(t) && !t.endsWith(':');
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function withStop(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function others(files: Attachment[]): string {
  return files
    .slice(1)
    .map((f) => f.name)
    .join(', ');
}
