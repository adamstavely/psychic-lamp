import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { CodeBlock } from '@adamstavely/trenchcoat/angular/code-block';
import type { RegistryItem } from '@donovan/contracts';
import { chatStart } from './use-in-chat';

type Model = Extract<RegistryItem, { kind: 'model' }>;

const TREND: Record<Model['details']['evals'][number]['trend'], string> = {
  up: 'Better',
  down: 'Worse',
  flat: 'No change',
};

/** A model on one page: its headline figures, evals and how to call it; in the aside, using it in chat, its
 *  specification and its files. */
@Component({
  selector: 'dn-model-detail',
  imports: [Button, CodeBlock],
  templateUrl: './model-detail.html',
  styleUrl: './detail.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModelDetail {
  readonly item = input.required<Model>();
  readonly #router = inject(Router);

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
