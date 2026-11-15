import { HttpClient, httpResource } from '@angular/common/http';
import {
  afterNextRender,
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
import { ActivatedRoute, Router } from '@angular/router';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import type { RegistryItem, RegistrySummary, SpaceRunResult } from '@donovan/contracts';
import { firstValueFrom } from 'rxjs';
import { linkTo } from './registry-links';
import { chatStart } from './use-in-chat';

type Space = Extract<RegistryItem, { kind: 'space' }>;

/**
 * A space: a small app on a model, to try with your own input or use in a chat. Runs are simulated. Opened with
 * `?try=sample` (the catalog's Try it), its input starts as the space's sample, focused and ready to run.
 */
@Component({
  selector: 'dn-space-detail',
  imports: [FormsModule, Button],
  templateUrl: './space-detail.html',
  styleUrl: './detail.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpaceDetail {
  readonly item = input.required<Space>();
  readonly #http = inject(HttpClient);
  readonly #router = inject(Router);
  readonly #models = httpResource<RegistrySummary[]>(() => '/api/registry?kind=model');

  protected input = '';
  private readonly field = viewChild.required<ElementRef<HTMLTextAreaElement>>('field');
  protected readonly running = signal(false);
  protected readonly result = signal<SpaceRunResult | null>(null);
  protected readonly error = signal('');

  /** Its model's page, when the registry has it. */
  protected readonly modelLink = computed(() =>
    linkTo(this.#models.hasValue() ? this.#models.value() : [], 'model', this.item().details.model),
  );

  constructor() {
    const trying = inject(ActivatedRoute).snapshot.queryParamMap.get('try') === 'sample';
    afterNextRender(() => {
      if (!trying) return;
      this.input = this.item().details.placeholder;
      this.field().nativeElement.value = this.input;
      this.field().nativeElement.focus();
    });
  }

  protected useInChat(): void {
    void this.#router.navigate(['/chats/new'], { queryParams: chatStart(this.item()) });
  }

  protected open(link: string[]): void {
    void this.#router.navigate(link);
  }

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
