import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AgentPlan } from '@adamstavely/trenchcoat/angular/agent-plan';
import { ApprovalCard } from '@adamstavely/trenchcoat/angular/approval-card';
import { ClaimAnswer } from '@adamstavely/trenchcoat/angular/claim-answer';
import { CodeBlock } from '@adamstavely/trenchcoat/angular/code-block';
import { DataTable } from '@adamstavely/trenchcoat/angular/data-table';
import { MeterRow } from '@adamstavely/trenchcoat/angular/meter-row';
import { StatusTracker } from '@adamstavely/trenchcoat/angular/status-tracker';
import { ToolCallCard } from '@adamstavely/trenchcoat/angular/tool-call-card';
import type { ApprovalDecision, ApprovalDetail } from '@adamstavely/trenchcoat/approval-card';
import type { Block, ToolDecision } from '@donovan/contracts';
import { claimsFor, planSteps, tableFor, toolStatus, trackerFor } from './blocks';

/** One piece of an assistant answer, drawn with the Trench Coat element that fits it. */
@Component({
  selector: 'dn-block',
  imports: [
    RouterLink,
    AgentPlan,
    ApprovalCard,
    ClaimAnswer,
    CodeBlock,
    DataTable,
    MeterRow,
    StatusTracker,
    ToolCallCard,
  ],
  templateUrl: './block-view.html',
  styleUrl: './block-view.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BlockView {
  readonly block = input.required<Block>();
  /** Approves or denies a waiting write tool; the card waits on the promise. Unset, waiting tools only say so. */
  readonly decide = input<(toolId: string, decision: ToolDecision) => Promise<void>>();

  protected readonly approval = computed(() => {
    const b = this.block();
    if (b.type !== 'tool' || b.status !== 'pending' || !this.decide()) return null;
    const details: ApprovalDetail[] = [
      { label: 'Tool', value: `${b.name} · write` },
      { label: 'Server', value: b.server },
      { label: 'Sensitivity', value: b.sensitivity },
      { label: 'Can approve', value: 'You (chat owner)' },
      ...Object.entries(b.args).map(([label, value]) => ({ label, value })),
    ];
    return {
      heading: `Approve ${b.name}?`,
      why: `${b.name} changes something outside Donovan (${b.server}), so it runs only after you review it.`,
      risk:
        b.sensitivity === 'Confidential' || b.sensitivity === 'Restricted' ? ('high' as const) : ('medium' as const),
      details,
      approve: (d: ApprovalDecision) => this.decide()!(b.id, { decision: 'approve', always: d.always }),
    };
  });

  protected deny(toolId: string): void {
    void this.decide()?.(toolId, { decision: 'deny', always: false });
  }

  protected readonly toolStatus = toolStatus;
  protected readonly table = computed(() => {
    const b = this.block();
    return b.type === 'table' ? tableFor(b) : null;
  });
  protected readonly claims = computed(() => {
    const b = this.block();
    return b.type === 'claims' ? claimsFor(b) : null;
  });
  protected readonly plan = computed(() => {
    const b = this.block();
    return b.type === 'steps' ? planSteps(b) : [];
  });
  protected readonly tracker = computed(() => {
    const b = this.block();
    return b.type === 'workflow' ? trackerFor(b) : null;
  });
}
