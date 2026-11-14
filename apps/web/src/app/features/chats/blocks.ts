import type { AnswerClaim, ClaimSource } from '@adamstavely/trenchcoat/claim-answer';
import type { AgentPlanStep } from '@adamstavely/trenchcoat/agent-plan';
import type { DataColumn, DataRow } from '@adamstavely/trenchcoat/data-table';
import type { StatusTrackerStatus, StatusTrackerStep } from '@adamstavely/trenchcoat/status-tracker';
import type { ToolCallStatus } from '@adamstavely/trenchcoat/tool-call-card';
import type { BlockOf, Claim, ToolStatus } from '@donovan/contracts';

// Pure mappings from Donovan's blocks to the shapes Trench Coat's elements take.

/** Trench Coat's tool card knows running, success and error; waiting and denied calls show as running and error. */
export function toolStatus(status: ToolStatus): ToolCallStatus {
  return status === 'done' ? 'success' : status === 'denied' || status === 'error' ? 'error' : 'running';
}

export function tableFor(block: BlockOf<'table'>): { columns: DataColumn[]; rows: DataRow[] } {
  const keys = block.columns.map((_, i) => `c${i}`);
  return {
    columns: block.columns.map((label, i) => ({ key: keys[i]!, label, type: i === 0 ? 'title' : 'text' })),
    rows: block.rows.map((cells, r) => ({ id: `r${r}`, ...Object.fromEntries(cells.map((c, i) => [keys[i]!, c])) })),
  };
}

const CONFIDENCE: Record<Claim['confidence'], number> = { high: 0.9, medium: 0.6, low: 0.3 };

export function claimsFor(block: BlockOf<'claims'>): { claims: AnswerClaim[]; sources: ClaimSource[] } {
  const sources: ClaimSource[] = [];
  const claims = block.items.map((c, i): AnswerClaim => {
    let sourceIds: string[] | undefined;
    if (c.source) {
      const id = `${c.id}-source`;
      sources.push({ id, title: c.source.title, site: c.source.publisher, quote: c.source.passage });
      sourceIds = [id];
    }
    const note = [c.source?.match, c.note, c.cutoff ? `Knowledge cutoff: ${c.cutoff}` : null]
      .filter(Boolean)
      .join(' · ');
    return {
      id: c.id,
      // tc-claim-answer runs claims together as one paragraph; each after the first brings its own space.
      text: i === 0 ? c.text : ` ${c.text}`,
      source: c.kind,
      confidence: CONFIDENCE[c.confidence],
      ...(note ? { note } : {}),
      ...(sourceIds ? { sources: sourceIds } : {}),
    };
  });
  return { claims, sources };
}

export function planSteps(block: BlockOf<'steps'>): AgentPlanStep[] {
  return block.items.map((item, i) => ({
    id: `s${i}`,
    title: item.label,
    status:
      item.status === 'done' ? 'done' : item.status === 'active' || item.status === 'awaiting' ? 'active' : 'pending',
  }));
}

/** The workflow's steps, with statuses that say in words what the colours show. */
export function trackerFor(block: BlockOf<'workflow'>): {
  steps: StatusTrackerStep[];
  statuses: Record<string, StatusTrackerStatus>;
} {
  return {
    steps: block.steps.map((s, i) => ({ id: `w${i}`, label: s.label, status: s.status })),
    statuses: {
      done: { label: 'Done', tone: 'success', mark: 'check', done: true },
      active: { label: 'Running', tone: 'info' },
      awaiting: { label: 'Waiting for approval', tone: 'warning' },
      pending: { label: 'Not started', tone: 'neutral' },
    },
  };
}
