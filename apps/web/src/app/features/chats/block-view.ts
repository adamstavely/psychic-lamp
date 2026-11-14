import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AgentPlan } from '@adamstavely/trenchcoat/angular/agent-plan';
import { ClaimAnswer } from '@adamstavely/trenchcoat/angular/claim-answer';
import { CodeBlock } from '@adamstavely/trenchcoat/angular/code-block';
import { DataTable } from '@adamstavely/trenchcoat/angular/data-table';
import { MeterRow } from '@adamstavely/trenchcoat/angular/meter-row';
import { StatusTracker } from '@adamstavely/trenchcoat/angular/status-tracker';
import { ToolCallCard } from '@adamstavely/trenchcoat/angular/tool-call-card';
import type { Block } from '@donovan/contracts';
import { claimsFor, planSteps, tableFor, toolStatus, trackerFor } from './blocks';

/** One piece of an assistant answer, drawn with the Trench Coat element that fits it. */
@Component({
  selector: 'dn-block',
  imports: [RouterLink, AgentPlan, ClaimAnswer, CodeBlock, DataTable, MeterRow, StatusTracker, ToolCallCard],
  templateUrl: './block-view.html',
  styleUrl: './block-view.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BlockView {
  readonly block = input.required<Block>();

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
