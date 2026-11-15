import { HttpClient, httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  type ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { SegmentedControl } from '@adamstavely/trenchcoat/angular/segmented-control';
import { Switch } from '@adamstavely/trenchcoat/angular/switch';
import type { SegmentOption } from '@adamstavely/trenchcoat/segmented-control';
import { toast } from '@adamstavely/trenchcoat/toaster';
import type {
  DecisionResult,
  GovernanceQueue,
  Policy,
  PolicyList,
  QueueItem,
  ReviewDecision,
} from '@donovan/contracts';
import { firstValueFrom } from 'rxjs';
import { buildAreaFor } from '../../shell/areas';
import { RegistryCountsStore } from '../../core/registry-counts-store';

type Tab = 'queue' | 'policies' | 'tiers';

const TIERS = [
  { name: 'Public', who: 'Anyone in the org', rule: 'No approval' },
  { name: 'Internal', who: 'Workspace members', rule: 'Write tools need approval' },
  { name: 'Confidential', who: 'Project members', rule: 'All tools need approval; no external servers' },
  { name: 'Restricted', who: 'Named approvers', rule: 'Picked by hand only; every call is audited' },
];

const DONE: Record<ReviewDecision, string> = {
  approve: 'You approved it',
  changes: 'You asked for changes',
  reject: 'You rejected it',
};

/**
 * Governance: the review queue (two approvals from people other than the submitter publish an item; one request for
 * changes or rejection stops it), the workspace's policies (only a Donovan admin changes them) and the tiers.
 */
@Component({
  selector: 'dn-governance-page',
  imports: [FormsModule, RouterLink, Button, SegmentedControl, Switch],
  templateUrl: './governance-page.html',
  styleUrls: ['./detail.css', './governance-page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GovernancePage {
  /** From the URL (?tab=), so a tab can be linked to. */
  readonly tab = input<string>();
  readonly #http = inject(HttpClient);
  readonly #counts = inject(RegistryCountsStore);
  readonly #router = inject(Router);

  protected readonly current = computed<Tab>(() => {
    const t = this.tab();
    return t === 'policies' || t === 'tiers' ? t : 'queue';
  });
  protected readonly queue = httpResource<GovernanceQueue>(() => '/api/governance/queue');
  protected readonly policyList = httpResource<PolicyList>(() => '/api/governance/policies');
  protected readonly tiers = TIERS;
  protected readonly done = DONE;

  protected readonly tabs = computed<SegmentOption[]>(() => [
    {
      value: 'queue',
      label: `Queue · ${this.queue.hasValue() ? this.queue.value().waiting : '…'}`,
      controls: 'governance-panel',
    },
    { value: 'policies', label: 'Policies', controls: 'governance-panel' },
    { value: 'tiers', label: 'Tiers', controls: 'governance-panel' },
  ]);
  protected readonly tabLabel = computed(
    () => ({ queue: 'Queue', policies: 'Policies', tiers: 'Tiers' })[this.current()],
  );

  protected pick(event: CustomEvent<{ value: unknown }>): void {
    const tab = event.detail.value as Tab;
    void this.#router.navigate([], { queryParams: { tab: tab === 'queue' ? null : tab }, replaceUrl: true });
  }

  protected link(q: QueueItem): string[] {
    return [buildAreaFor(q.item.kind).path, q.item.id];
  }
  readonly #when = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  protected when(at: string): string {
    return this.#when.format(new Date(at));
  }

  // Deciding: approval goes at once; a request for changes or a rejection asks why first.
  private readonly noteDialog = viewChild.required<ElementRef<HTMLDialogElement>>('noteDialog');
  protected readonly asking = signal<{ q: QueueItem; decision: 'changes' | 'reject' } | null>(null);
  protected note = '';
  protected readonly deciding = signal<string | null>(null);

  protected ask(q: QueueItem, decision: 'changes' | 'reject'): void {
    this.note = '';
    this.asking.set({ q, decision });
    this.noteDialog().nativeElement.showModal();
  }

  protected closeNote(): void {
    this.noteDialog().nativeElement.close();
  }

  protected async decide(q: QueueItem, decision: ReviewDecision, note = ''): Promise<void> {
    const key = `${q.item.kind}:${q.item.id}`;
    this.deciding.set(key);
    try {
      const url = `/api/governance/queue/${q.item.kind}/${encodeURIComponent(q.item.id)}/decisions`;
      const res = await firstValueFrom(this.#http.post<DecisionResult>(url, { decision, note }));
      toast.success(
        res.status === 'published'
          ? `Published ${q.item.name}`
          : res.status === 'pending'
            ? `Approved ${q.item.name}: ${res.approvals} of 2`
            : res.status === 'rejected'
              ? `Rejected ${q.item.name}`
              : `Sent ${q.item.name} back for changes`,
      );
      if (decision !== 'approve') this.closeNote();
    } catch (err) {
      toast.error("Couldn't record that", {
        description: (err as { error?: { message?: string } }).error?.message ?? 'Try again in a moment.',
      });
    } finally {
      this.deciding.set(null);
      this.queue.reload();
      this.#counts.changed();
    }
  }

  protected async sendNote(): Promise<void> {
    const a = this.asking();
    if (!a || !this.note.trim()) return;
    await this.decide(a.q, a.decision, this.note.trim());
  }

  protected async setPolicy(p: Policy, event: CustomEvent<{ value: unknown }>): Promise<void> {
    const enabled = event.detail.value === true;
    try {
      await firstValueFrom(this.#http.patch<Policy>(`/api/governance/policies/${p.id}`, { enabled }));
      toast.success(`${p.name}: ${enabled ? 'on' : 'off'}`);
    } catch (err) {
      toast.error("Couldn't change the policy", {
        description: (err as { error?: { message?: string } }).error?.message ?? 'Try again in a moment.',
      });
    } finally {
      this.policyList.reload();
    }
  }
}
