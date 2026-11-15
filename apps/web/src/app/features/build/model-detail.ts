import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { CodeBlock } from '@adamstavely/trenchcoat/angular/code-block';
import { SegmentedControl } from '@adamstavely/trenchcoat/angular/segmented-control';
import type { SegmentOption } from '@adamstavely/trenchcoat/segmented-control';
import type { RegistryItem } from '@donovan/contracts';
import { chatStart } from './use-in-chat';

type Model = Extract<RegistryItem, { kind: 'model' }>;
type Tab = 'card' | 'use' | 'files' | 'evals';

const TREND: Record<Model['details']['evals'][number]['trend'], string> = {
  up: 'Better',
  down: 'Worse',
  flat: 'No change',
};

/** A model: its card (headline figures and what it's for), how to call it, its files and its evals. */
@Component({
  selector: 'dn-model-detail',
  imports: [Button, CodeBlock, SegmentedControl],
  templateUrl: './model-detail.html',
  styleUrls: ['./detail.css', './model-detail.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModelDetail {
  readonly item = input.required<Model>();
  readonly #router = inject(Router);

  protected readonly tab = signal<Tab>('card');
  protected readonly tabs = computed<SegmentOption[]>(() => [
    { value: 'card', label: 'Card', controls: 'model-panel' },
    { value: 'use', label: 'Use', controls: 'model-panel' },
    { value: 'files', label: `Files · ${this.item().details.files.length}`, controls: 'model-panel' },
    { value: 'evals', label: `Evals · ${this.item().details.evals.length}`, controls: 'model-panel' },
  ]);
  protected readonly tabLabel = computed(
    () => ({ card: 'Card', use: 'Use', files: 'Files', evals: 'Evals' })[this.tab()],
  );
  protected pick(event: CustomEvent<{ value: unknown }>): void {
    this.tab.set(event.detail.value as Tab);
  }
  protected readonly trend = TREND;

  /** A foundation model is chatted with; a task model is loaded and run on a batch. */
  protected readonly code = computed(() => {
    const m = this.item();
    return m.details.task === 'Foundation'
      ? `from donovan import Client\n\nclient = Client()\nreply = client.chat(\n    model="${m.slug}",\n    messages=[{"role": "user", "content": "Summarize last week's fraud batch"}],\n    tools="auto",  # this workspace's skills and servers\n)`
      : `from donovan import load_model\n\nmodel = load_model("${m.slug}", revision="${m.version}")\nscores = model.predict(batch)\nexplanation = model.explain(scores.top(40))`;
  });

  protected useInChat(): void {
    void this.#router.navigate(['/chats/new'], { queryParams: chatStart(this.item()) });
  }
}
