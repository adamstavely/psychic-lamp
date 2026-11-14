import { HttpClient, httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { SegmentedControl } from '@adamstavely/trenchcoat/angular/segmented-control';
import type { SegmentOption } from '@adamstavely/trenchcoat/segmented-control';
import { toast } from '@adamstavely/trenchcoat/toaster';
import type { ArtifactKind, ArtifactSummary } from '@donovan/contracts';
import { UPLOAD_LIMIT_BYTES } from '@donovan/contracts/defaults';
import { firstValueFrom } from 'rxjs';
import { relativeDay } from '../brief/format';

type Filter = 'all' | ArtifactKind;

/** Everything Donovan has produced in your chats, and files you've added: filter, search, open, upload. */
@Component({
  selector: 'dn-artifacts-page',
  imports: [FormsModule, RouterLink, Button, SegmentedControl],
  templateUrl: './artifacts-page.html',
  styleUrl: './artifacts-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ArtifactsPage {
  readonly #http = inject(HttpClient);
  readonly #router = inject(Router);

  protected readonly filter = signal<Filter>('all');
  protected query = '';
  protected readonly search = signal('');
  protected readonly now = new Date();

  /** All of them, for the counts; searching asks the API (Elasticsearch) instead. */
  readonly #all = httpResource<ArtifactSummary[]>(() => '/api/artifacts');
  protected readonly results = httpResource<ArtifactSummary[]>(() =>
    this.search() ? { url: '/api/artifacts', params: { q: this.search() } } : undefined,
  );

  protected readonly loading = computed(() => (this.search() ? this.results.isLoading() : this.#all.isLoading()));
  protected readonly failed = computed(() => !!(this.search() ? this.results.error() : this.#all.error()));
  protected readonly shown = computed(() => {
    const source = this.search()
      ? this.results.hasValue()
        ? this.results.value()
        : []
      : this.#all.hasValue()
        ? this.#all.value()
        : [];
    const f = this.filter();
    return f === 'all' ? source : source.filter((a) => a.kind === f);
  });

  protected readonly filters = computed<SegmentOption[]>(() => {
    const all = this.#all.hasValue() ? this.#all.value() : [];
    const count = (k: ArtifactKind) => all.filter((a) => a.kind === k).length;
    return [
      { value: 'all', label: 'All artifacts', count: all.length },
      { value: 'Doc', label: 'Docs', count: count('Doc') },
      { value: 'Code', label: 'Code', count: count('Code') },
      { value: 'Data', label: 'Data', count: count('Data') },
    ];
  });

  protected readonly status = computed(() => {
    if (this.loading()) return 'Loading artifacts…';
    const n = this.shown().length;
    return this.search() ? `${n} ${n === 1 ? 'artifact matches' : 'artifacts match'} “${this.search()}”.` : '';
  });

  protected when(iso: string): string {
    return relativeDay(iso, this.now);
  }

  protected pick(event: CustomEvent<{ value: unknown }>): void {
    this.filter.set(event.detail.value as Filter);
  }

  protected runSearch(): void {
    this.search.set(this.query.trim());
  }

  protected clearSearch(): void {
    this.query = '';
    this.search.set('');
  }

  protected async upload(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > UPLOAD_LIMIT_BYTES) {
      toast.error(`${file.name} is too big`, { description: 'Files can be up to 512 KB.' });
      return;
    }
    try {
      const saved = await firstValueFrom(
        this.#http.post<ArtifactSummary>('/api/artifacts', { name: file.name, content: await file.text() }),
      );
      toast.success(`Added ${saved.name}`);
      this.#all.reload();
      await this.#router.navigate(['/artifacts', saved.id]);
    } catch (err) {
      const message = (err as { error?: { message?: string } }).error?.message;
      toast.error(`Couldn't add ${file.name}`, { description: message ?? 'Try again in a moment.' });
    }
  }
}
