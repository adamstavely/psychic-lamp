import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { ContextWindow } from '@adamstavely/trenchcoat/angular/context-window';
import { SegmentedControl } from '@adamstavely/trenchcoat/angular/segmented-control';
import { Switch } from '@adamstavely/trenchcoat/angular/switch';
import type { ContextPart } from '@adamstavely/trenchcoat/context-window';
import type { SegmentOption } from '@adamstavely/trenchcoat/segmented-control';
import type { Claim, SessionIntentInput, UserMessage } from '@donovan/contracts';
import {
  allClaims,
  chatArtifacts,
  chatAttachments,
  chatSources,
  CLAIM_KIND,
  claimSummary,
  routingSummary,
} from './session';
import { ThreadStore } from './thread-store';

type Tab = 'session' | 'artifacts' | 'sources' | 'metadata';

const KIND_LABEL = { model: 'Model', skill: 'Skill', server: 'Server', dataset: 'Dataset', flow: 'Workflow' } as const;

/** Beside the thread: what the session is for, its claims and your verdicts, what it produced and drew on, and how. */
@Component({
  selector: 'dn-session-panel',
  imports: [FormsModule, RouterLink, Button, ContextWindow, SegmentedControl, Switch],
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
  protected readonly attached = computed(() => chatAttachments(this.thread.messages()));
  protected readonly bookmarks = computed(() =>
    this.thread.messages().filter((m): m is UserMessage => m.role === 'user' && !!m.bookmarked),
  );

  /** Scrolls the thread to a bookmarked question and puts focus on it. */
  protected jumpTo(m: UserMessage): void {
    const turn = document.getElementById(`turn-${m.id}`);
    turn?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    turn?.focus({ preventScroll: true });
  }
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

  /** The intent form, open while setting or editing the intent. */
  protected readonly editingIntent = signal(false);
  protected readonly intentDraft: SessionIntentInput = { task: '', decision: '', consequence: '' };
  protected readonly saving = signal(false);

  protected async setCalibrated(event: CustomEvent<{ value: unknown }>): Promise<void> {
    const calibrated = event.detail.value === true;
    await this.thread.update({ calibrated }).catch(() => undefined);
    this.thread.status.set(calibrated ? 'Calibrated mode on: new answers label their claims.' : 'Calibrated mode off.');
  }

  protected editIntent(): void {
    Object.assign(this.intentDraft, this.chat()?.intent ?? { task: '', decision: '', consequence: '' });
    this.editingIntent.set(true);
  }

  protected async saveIntent(): Promise<void> {
    const intent = {
      task: this.intentDraft.task.trim(),
      decision: this.intentDraft.decision.trim(),
      consequence: this.intentDraft.consequence.trim(),
    };
    if (!intent.task || !intent.decision || !intent.consequence) return;
    this.saving.set(true);
    try {
      await this.thread.update({ intent });
      this.editingIntent.set(false);
      this.thread.status.set('Session intent saved.');
    } catch {
      // update() has said so.
    } finally {
      this.saving.set(false);
    }
  }

  protected review(claim: Claim, verdict: 'confirmed' | 'disputed'): void {
    void this.thread.reviewClaim(claim.id, claim.review === verdict ? null : verdict);
  }

  protected exportProvenance(): Promise<void> {
    return this.thread.exportProvenance();
  }
}
