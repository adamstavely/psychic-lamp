import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { CodeBlock } from '@adamstavely/trenchcoat/angular/code-block';
import type { RegistryItem, RegistrySummary } from '@donovan/contracts';
import { linked } from './registry-links';
import { chatStart } from './use-in-chat';

type Dataset = Extract<RegistryItem, { kind: 'dataset' }>;

/** A dataset: its size and shape, its schema, how to load it, and the models trained on it. */
@Component({
  selector: 'dn-dataset-detail',
  imports: [RouterLink, Button, CodeBlock],
  templateUrl: './dataset-detail.html',
  styleUrl: './detail.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DatasetDetail {
  readonly item = input.required<Dataset>();
  readonly #router = inject(Router);
  readonly #models = httpResource<RegistrySummary[]>(() => '/api/registry?kind=model');

  /** The models that use it, linked to their pages when the registry has them. */
  protected readonly usedBy = computed(() => {
    const models = this.#models.hasValue() ? this.#models.value() : [];
    return this.item().details.usedBy.map((r) => linked(models, 'model', r));
  });

  protected readonly code = computed(
    () =>
      `from donovan import load_dataset\n\nds = load_dataset("${this.item().slug}", revision="${this.item().version}")\ntrain = ds["train"]`,
  );

  protected useInChat(): void {
    void this.#router.navigate(['/chats/new'], { queryParams: chatStart(this.item()) });
  }
}
