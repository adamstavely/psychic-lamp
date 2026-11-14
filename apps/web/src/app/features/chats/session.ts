import type { Block, BlockOf, Claim, Message, Route } from '@donovan/contracts';

// What the session panel shows, worked out from the thread.

export function allClaims(messages: Message[]): Claim[] {
  return messages.flatMap((m) =>
    m.role === 'assistant' ? m.blocks.flatMap((b) => (b.type === 'claims' ? b.items : [])) : [],
  );
}

export function claimSummary(claims: Claim[]): { confirmed: number; disputed: number; unresolved: number } {
  const confirmed = claims.filter((c) => c.review === 'confirmed').length;
  const disputed = claims.filter((c) => c.review === 'disputed').length;
  return { confirmed, disputed, unresolved: claims.length - confirmed - disputed };
}

/** Every artifact the chat produced, latest version of each. */
export function chatArtifacts(messages: Message[]): BlockOf<'artifact'>[] {
  const byId = new Map<string, BlockOf<'artifact'>>();
  for (const m of messages)
    if (m.role === 'assistant') for (const b of m.blocks) if (b.type === 'artifact') byId.set(b.artifactId, b);
  return [...byId.values()];
}

/** The models, skills, servers, datasets and workflows the chat drew on, each once. */
export function chatSources(messages: Message[]): Route[] {
  const seen = new Map<string, Route>();
  for (const m of messages) if (m.role === 'assistant') for (const r of m.routing) seen.set(`${r.kind}:${r.name}`, r);
  return [...seen.values()];
}

/** "2 models · 1 skill · 3 servers" */
export function routingSummary(routes: Route[]): string {
  const names: Record<Route['kind'], [string, string]> = {
    model: ['model', 'models'],
    skill: ['skill', 'skills'],
    server: ['server', 'servers'],
    dataset: ['dataset', 'datasets'],
    flow: ['workflow', 'workflows'],
  };
  return (Object.keys(names) as Route['kind'][])
    .map((k) => [k, routes.filter((r) => r.kind === k).length] as const)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${names[k][n === 1 ? 0 : 1]}`)
    .join(' · ');
}

/** A Calibrated session asks for a verification plan once it has two answers and none has been given. */
export function needsCheckpoint(calibrated: boolean, messages: Message[], checkpoints: number): boolean {
  return calibrated && checkpoints === 0 && messages.filter((m) => m.role === 'assistant').length >= 2;
}

export const CLAIM_KIND: Record<Claim['kind'], string> = {
  grounded: 'Grounded',
  inferred: 'Inferred',
  model: 'Model knowledge',
};

export function isClaims(b: Block): b is BlockOf<'claims'> {
  return b.type === 'claims';
}
