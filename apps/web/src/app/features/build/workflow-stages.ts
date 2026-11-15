import type { WorkflowNode } from '@donovan/contracts';

type Edge = readonly [string, string];

/**
 * The steps in the order they can run: each stage is the steps whose every step before them is in an earlier one.
 * A step id that appears twice (a malformed stored graph; the API refuses new ones) counts once, as its first step, and
 * every pass places at least one step, so this always ends.
 */
export function stagesOf(nodes: readonly WorkflowNode[], edges: readonly Edge[]): WorkflowNode[][] {
  const byId = new Map<string, WorkflowNode>();
  for (const n of nodes) if (!byId.has(n.id)) byId.set(n.id, n);
  const steps = [...byId.values()];
  const live = edges.filter(([a, b]) => byId.has(a) && byId.has(b) && a !== b);
  const placed = new Set<string>();
  const out: WorkflowNode[][] = [];
  while (placed.size < steps.length) {
    const left = steps.filter((n) => !placed.has(n.id));
    const ready = left.filter((n) => live.every(([a, b]) => b !== n.id || placed.has(a)));
    // A loop: run what's left together rather than never.
    const stage = (ready.length ? ready : left).sort((a, b) => a.y - b.y);
    for (const n of stage) placed.add(n.id);
    out.push(stage);
  }
  return out;
}
