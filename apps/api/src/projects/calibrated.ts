import type { CitedText, Claim, ProjectSource } from '@donovan/contracts';

/**
 * A Calibrated project's answer, statement by statement: each claim labelled by what backs it (two or more selected
 * sources, one, or none), and the one to check first before acting on the answer.
 */
export function calibrate(
  answer: CitedText,
  sources: readonly Pick<ProjectSource, 'id' | 'title' | 'meta'>[],
): { claims: Claim[]; checkpoint: string } {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const claims: Claim[] = [];
  for (const seg of answer) {
    // A segment starts with the punctuation that ended the one before it.
    const text = seg.text.replace(/^[\s.,;:]+/, '').trim();
    if (!/\p{L}/u.test(text)) continue;
    const cited = seg.cite.map((id) => byId.get(id)).filter((s) => s !== undefined);
    const first = cited[0];
    claims.push({
      id: `c${claims.length + 1}`,
      kind: first ? 'grounded' : 'inferred',
      confidence: cited.length >= 2 ? 'high' : cited.length === 1 ? 'medium' : 'low',
      text: /[.!?]$/.test(text) ? text : `${text}.`,
      topic: first?.title ?? 'Not in a selected source',
      source: first
        ? {
            title: first.title,
            publisher: first.meta,
            match: cited.length >= 2 ? 'Strong match' : 'Partial match',
            passage: text,
          }
        : null,
      note:
        cited.length > 1
          ? `Also in ${cited
              .slice(1)
              .map((s) => s.title)
              .join(', ')}`
          : first
            ? null
            : 'No selected source says this; it was reasoned from the others',
      cutoff: null,
      review: null,
    });
  }
  return { claims, checkpoint: checkpointFor(claims) };
}

/** What to verify first: an unbacked claim, else one resting on a single source, else the answer as a whole. */
function checkpointFor(claims: readonly Claim[]): string {
  const unbacked = claims.find((c) => c.kind !== 'grounded');
  if (unbacked) return `Before acting, check “${short(unbacked.text)}”: no selected source says it.`;
  const single = claims.find((c) => c.confidence === 'medium');
  if (single?.source)
    return `Before acting, confirm “${short(single.text)}” in ${single.source.title}, its only source.`;
  return claims.length
    ? 'Every claim cites two or more selected sources. Spot-check one before acting.'
    : 'There are no claims to check.';
}

function short(text: string): string {
  const t = text.replace(/[.!?]$/, '');
  return t.length > 90 ? `${t.slice(0, 87).trimEnd()}…` : t;
}
