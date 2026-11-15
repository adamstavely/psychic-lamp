import { HttpClient, httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  type OnInit,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { toast } from '@adamstavely/trenchcoat/toaster';
import type { RegistryItem, ReviewDecision, ReviewHistory } from '@donovan/contracts';
import { firstValueFrom } from 'rxjs';

const STATUS: Record<RegistryItem['status'], string> = {
  draft: 'Draft',
  pending: 'Waiting for review',
  'changes-requested': 'Changes requested',
  published: 'Published',
  rejected: 'Rejected',
};
const DECISION: Record<ReviewDecision, string> = {
  approve: 'approved',
  changes: 'asked for changes',
  reject: 'rejected',
};

/**
 * Where an item that isn't published yet is in review: its status, every decision so far, and, for its owner when it
 * was sent back or rejected, resubmitting it (with a revised summary) for a new round.
 */
@Component({
  selector: 'dn-review-status',
  imports: [FormsModule, Button],
  template: `
    @let i = item();
    <section class="review" aria-labelledby="review-h" [attr.data-status]="i.status">
      <h2 id="review-h">{{ status[i.status] }}</h2>
      @if (history.hasValue()) {
        @let h = history.value();
        @if (i.status === 'pending') {
          <p>
            Two approvals from people other than its submitter publish it. Round {{ h.round }}: {{ approvals() }} of 2.
          </p>
        }
        @if (h.records.length) {
          <ol class="records">
            @for (r of h.records; track r.at + r.reviewer) {
              <li>
                <strong>{{ r.reviewer }}</strong> {{ decision[r.decision] }}
                {{ r.version ? r.version + ' ' : '' }}(round {{ r.round }}, {{ when(r.at) }})
                @if (r.note) {
                  : “{{ r.note }}”
                }
              </li>
            }
          </ol>
        }
      }
      @if (canResubmit()) {
        <form (submit)="$event.preventDefault(); resubmit()">
          <label>
            Summary
            <textarea name="summary" rows="2" [(ngModel)]="summary"></textarea>
          </label>
          <tc-button type="submit" variant="primary" label="Resubmit for review" [loading]="sending()" />
        </form>
      }
    </section>
  `,
  styles: `
    .review {
      display: grid;
      gap: var(--tc-space-2);
      margin-bottom: var(--tc-space-6);
      padding: var(--tc-space-4);
      border: 1px solid var(--tc-border-subtle);
      border-radius: var(--tc-radius-md);
      background: var(--tc-surface-raised);
      font-size: var(--tc-font-size-sm);
    }
    .review[data-status='changes-requested'] h2,
    .review[data-status='pending'] h2 {
      color: var(--tc-status-warning-fg);
    }
    .review[data-status='rejected'] h2 {
      color: var(--tc-status-danger-fg);
    }
    h2 {
      margin: 0;
      font-size: var(--tc-font-size-md);
    }
    p {
      margin: 0;
    }
    .records {
      display: grid;
      gap: var(--tc-space-1);
      margin: 0;
      padding-inline-start: var(--tc-space-5);
    }
    form {
      display: grid;
      gap: var(--tc-space-2);
      justify-items: start;
    }
    label {
      display: grid;
      gap: var(--tc-space-1);
      width: 100%;
    }
    textarea {
      padding: var(--tc-space-2);
      border: 1px solid var(--tc-border-control);
      border-radius: var(--tc-radius-md);
      background: var(--tc-surface-control);
      color: var(--tc-text-primary);
      font: inherit;
    }
    textarea:focus-visible {
      outline: var(--tc-focus-ring-width) solid var(--tc-focus-ring);
      outline-offset: 2px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewStatus implements OnInit {
  readonly item = input.required<RegistryItem>();
  /** Resubmitted: the page reloads the item. */
  readonly changed = output<void>();
  readonly #http = inject(HttpClient);

  protected readonly status = STATUS;
  protected readonly decision = DECISION;
  protected readonly history = httpResource<ReviewHistory>(
    () => `/api/governance/history/${this.item().kind}/${encodeURIComponent(this.item().id)}`,
  );
  protected readonly approvals = computed(() => {
    const h = this.history.hasValue() ? this.history.value() : null;
    return h ? h.records.filter((r) => r.round === h.round && r.decision === 'approve').length : 0;
  });
  /** The API says: its owner, or whoever sent it to review (a team's item they edited), while it's sent back. */
  protected readonly canResubmit = computed(() => this.history.hasValue() && this.history.value().canResubmit);

  protected summary = '';
  protected readonly sending = signal(false);
  readonly #when = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  protected when(at: string): string {
    return this.#when.format(new Date(at));
  }

  ngOnInit(): void {
    this.summary = this.item().summary;
  }

  protected async resubmit(): Promise<void> {
    this.sending.set(true);
    try {
      const url = `/api/governance/queue/${this.item().kind}/${encodeURIComponent(this.item().id)}/resubmit`;
      await firstValueFrom(this.#http.post<void>(url, { summary: this.summary.trim() || undefined }));
      toast.success('Resubmitted for review', { description: 'A new round starts, with no decisions yet.' });
      this.changed.emit();
    } catch (err) {
      toast.error("Couldn't resubmit it", {
        description: (err as { error?: { message?: string } }).error?.message ?? 'Try again in a moment.',
      });
    } finally {
      this.sending.set(false);
    }
  }
}
