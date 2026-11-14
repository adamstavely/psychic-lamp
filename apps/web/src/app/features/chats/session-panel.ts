import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { ContextWindow } from '@adamstavely/trenchcoat/angular/context-window';
import { SegmentedControl } from '@adamstavely/trenchcoat/angular/segmented-control';
import type { ContextPart } from '@adamstavely/trenchcoat/context-window';
import type { SegmentOption } from '@adamstavely/trenchcoat/segmented-control';
import type { Claim } from '@donovan/contracts';
import { allClaims, chatArtifacts, chatSources, CLAIM_KIND, claimSummary, routingSummary } from './session';
import { ThreadStore } from './thread-store';

type Tab = 'session' | 'artifacts' | 'sources' | 'metadata';

const KIND_LABEL = { model: 'Model', skill: 'Skill', server: 'Server', dataset: 'Dataset', flow: 'Workflow' } as const;

/** Beside the thread: what the session is for, its claims and your verdicts, what it produced and drew on, and how. */
@Component({
  selector: 'dn-session-panel',
  imports: [RouterLink, Button, ContextWindow, SegmentedControl],
  templateUrl: './session-panel.html',
  styleUrl: './session-panel.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionPanel {
  protected readonly thread = inject(ThreadStore);
  protected readonly tab = signal<Tab>('session');
  protected readonly kindLabel = KIND_LABEL;
  protected readonly claimKind = CLAIM_KIND;

  protected readonly chat = computed(() => (this.thread.chat.hasValue() ? this.thread.chat.value() : null));
  protected readonly claims = computed(() => allClaims(this.thread.messages()));
  protected readonly summary = computed(() => claimSummary(this.claims()));
  protected readonly artifacts = computed(() => chatArtifacts(this.thread.messages()));
  protected readonly sources = computed(() => chatSources(this.thread.messages()));
  protected readonly routing = computed(() => routingSummary(this.sources()));
  protected readonly contextParts = computed<ContextPart[]>(
    () =>
      this.chat()?.context.parts.map((p, i) => ({ id: `p${i}`, label: p.label, tokens: p.tokens, locked: true })) ?? [],
  );

  protected readonly tabs = computed<SegmentOption[]>(() => [
    {
      value: 'session',
      label: 'Session',
      controls: 'panel-session',
      ...(this.summary().unresolved ? { count: this.summary().unresolved } : {}),
    },
    { value: 'artifacts', label: 'Artifacts', controls: 'panel-artifacts', count: this.artifacts().length },
    { value: 'sources', label: 'Sources', controls: 'panel-sources' },
    { value: 'metadata', label: 'Metadata', controls: 'panel-metadata' },
  ]);

  protected pick(event: CustomEvent<{ value: unknown }>): void {
    this.tab.set(event.detail.value as Tab);
  }

  protected review(claim: Claim, verdict: 'confirmed' | 'disputed'): void {
    void this.thread.reviewClaim(claim.id, claim.review === verdict ? null : verdict);
  }

  protected exportProvenance(): Promise<void> {
    return this.thread.exportProvenance();
  }
}
