// Plain values with no Zod, so the web app can import them without pulling the validator into its bundle.
// The schemas use these too, so there is one source for each default.

export const PREFERENCE_DEFAULTS = {
  theme: 'system',
  railExpanded: true,
  startMode: 'assist',
  showGovernance: true,
  briefAutoOpen: true,
} as const;

/** The largest file the Artifacts upload accepts, in bytes of UTF-8 (as the browser counts a file's size). */
export const UPLOAD_LIMIT_BYTES = 512 * 1024;

/**
 * The largest request body the API (and the proxies in front of it: deploy/web/nginx.conf.template and the ingress)
 * accepts. A file's text travels as a JSON string, where each control character becomes six bytes (\u0001), so an
 * upload at the limit can take up to six times its size; this covers that and the request's other fields.
 */
export const REQUEST_BODY_LIMIT_BYTES = 4 * 1024 * 1024;

/** The length of a text in bytes of UTF-8. */
export const utf8Bytes = (text: string): number => new TextEncoder().encode(text).length;

/** The chat personas (chat.ts Persona), as people see them, and what each does. */
export const PERSONAS = [
  { id: 'balanced', label: 'Balanced', description: 'Even-handed: the default' },
  { id: 'red-cell', label: 'Red Cell', description: 'Argues against the obvious reading' },
  { id: 'historian', label: 'Historian', description: 'Sets the question against what came before' },
  { id: 'collection', label: 'Collection', description: 'Gathers what is known before judging it' },
] as const;

/** What answers may draw on (chat.ts Knowledge), as people see it. */
export const KNOWLEDGE_SOURCES = [
  { id: 'workspace', label: 'Workspace docs', description: "The workspace's tools and documents" },
  { id: 'training', label: 'Training only', description: 'What the model knows; no tools or documents' },
  { id: 'live', label: 'Live', description: 'The workspace, plus a live web search' },
] as const;

/** Where a registry item can be installed (registry.ts InstallClient), as people see them. */
export const INSTALL_CLIENTS = [
  { id: 'donovan-chat', label: 'Donovan chat' },
  { id: 'claude-desktop', label: 'Claude Desktop' },
  { id: 'claude-code', label: 'Claude Code' },
  { id: 'cursor', label: 'Cursor' },
  { id: 'vscode', label: 'VS Code' },
] as const;

// A workflow's checks.
/** Just what the checks read of a workflow's graph (the contract's WorkflowGraph fits it). */
interface WorkflowShape {
  nodes: readonly { id: string; label: string; kind: string; sub: string }[];
  edges: readonly (readonly [string, string])[];
}

export interface WorkflowCheck {
  level: 'warn' | 'block';
  message: string;
}

/** A write tool, as the canvas binds it: "PIM · upsert_sku (write)". */
export const isWrite = (sub: string) => /\(write\)\s*$/.test(sub);

/**
 * What a workflow needs before it can be published, and what's worth a second look. Blocking: no trigger, a step joined
 * to one that doesn't exist, or a write tool with no approval before it. Worth a look: a step joined to nothing.
 * The canvas shows the same checks as people edit, and the API refuses to save with a blocking one.
 */
export function checkWorkflow(graph: WorkflowShape): WorkflowCheck[] {
  const ids = new Set(graph.nodes.map((n) => n.id));
  const out: WorkflowCheck[] = [];
  if (ids.size < graph.nodes.length)
    out.push({ level: 'block', message: 'Two steps share an id. Each step needs its own.' });
  if (!graph.nodes.some((n) => n.kind === 'Trigger'))
    out.push({ level: 'block', message: 'Add a trigger, so it knows when to run.' });
  for (const [from, to] of graph.edges)
    if (!ids.has(from) || !ids.has(to))
      out.push({ level: 'block', message: `A connection leads to a step that isn't there.` });
  const into = (id: string) => graph.edges.filter(([, to]) => to === id).map(([from]) => from);
  const approvedBefore = (id: string, seen = new Set<string>()): boolean =>
    into(id).some((from) => {
      if (seen.has(from)) return false;
      seen.add(from);
      const n = graph.nodes.find((x) => x.id === from);
      return n?.kind === 'Approval' || approvedBefore(from, seen);
    });
  for (const n of graph.nodes)
    if (n.kind === 'Tool' && isWrite(n.sub) && !approvedBefore(n.id))
      out.push({ level: 'block', message: `${n.label} writes outside Donovan with no approval before it.` });
  for (const n of graph.nodes)
    if (graph.nodes.length > 1 && !graph.edges.some(([a, b]) => a === n.id || b === n.id))
      out.push({ level: 'warn', message: `${n.label} isn't connected to anything.` });
  return out;
}
