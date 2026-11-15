import { HttpClient, httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import type { RegistryItem, RegistrySummary, SpaceRunResult } from '@donovan/contracts';
import { firstValueFrom } from 'rxjs';
import { linkTo } from './registry-links';

type Space = Extract<RegistryItem, { kind: 'space' }>;

/** A space: a small app on a model, to try with your own input. Runs are simulated. */
@Component({
  selector: 'dn-space-detail',
  imports: [FormsModule, RouterLink, Button],
  templateUrl: './space-detail.html',
  styleUrl: './detail.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpaceDetail {
  readonly item = input.required<Space>();
  readonly #http = inject(HttpClient);
  readonly #models = httpResource<RegistrySummary[]>(() => '/api/registry?kind=model');

  protected input = '';
  protected readonly running = signal(false);
  protected readonly result = signal<SpaceRunResult | null>(null);
  protected readonly error = signal('');

  /** Its model's page, when the registry has it. */
  protected readonly modelLink = computed(() =>
    linkTo(this.#models.hasValue() ? this.#models.value() : [], 'model', this.item().details.model),
  );

  protected async run(): Promise<void> {
    if (this.running()) return;
    if (!this.input.trim()) {
      this.error.set(`Give it ${this.item().details.inputLabel.toLowerCase()} to run on.`);
      return;
    }
    this.running.set(true);
    this.error.set('');
    try {
      const url = `/api/registry/space/${encodeURIComponent(this.item().id)}/run`;
      this.result.set(await firstValueFrom(this.#http.post<SpaceRunResult>(url, { input: this.input })));
    } catch {
      this.error.set("The space didn't answer. Try again.");
    } finally {
      this.running.set(false);
    }
  }
}
