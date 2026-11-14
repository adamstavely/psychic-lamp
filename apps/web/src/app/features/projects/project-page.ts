import { HttpClient, httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { Checkbox } from '@adamstavely/trenchcoat/angular/checkbox';
import { CitedAnswer } from '@adamstavely/trenchcoat/angular/cited-answer';
import { SegmentedControl } from '@adamstavely/trenchcoat/angular/segmented-control';
import { SharePanel } from '@adamstavely/trenchcoat/angular/share-panel';
import { Switch } from '@adamstavely/trenchcoat/angular/switch';
import type { CitedSegment, CitedSource } from '@adamstavely/trenchcoat/cited-answer';
import type { SegmentOption } from '@adamstavely/trenchcoat/segmented-control';
import type {
  ShareEntitlementCheck,
  ShareGrant,
  ShareLevel,
  ShareRecipient,
  ShareSubmit,
} from '@adamstavely/trenchcoat/share-panel';
import { toast } from '@adamstavely/trenchcoat/toaster';
import type {
  ArtifactSummary,
  CitedText,
  NewOutput,
  Project,
  ProjectAnswer,
  ProjectSource,
  ProjectSummary,
  Recipient,
  SourceCandidate,
  SourceSearch,
  SourceSearchResult,
} from '@donovan/contracts';
import { firstValueFrom } from 'rxjs';
import { relativeDay } from '../brief/format';

const KIND: Record<ProjectSource['kind'], string> = {
  pdf: 'PDF',
  sheet: 'Sheet',
  doc: 'Doc',
  slack: 'Slack',
  connector: 'Live connector',
  web: 'Web',
  dataset: 'Dataset',
};

const TOOLS: { tool: NewOutput['tool']; label: string; hint: string }[] = [
  { tool: 'brief', label: 'Brief', hint: 'A one-page summary of the selected sources' },
  { tool: 'table', label: 'Source table', hint: 'Each source, its kind and detail' },
  { tool: 'faq', label: 'FAQ', hint: "The project's questions, answered" },
  { tool: 'timeline', label: 'Timeline', hint: 'What each source adds, in order' },
];

const LEVELS: ShareLevel[] = [
  { id: 'viewer', label: 'Can view' },
  { id: 'editor', label: 'Can edit' },
];

/**
 * A project: the sources it reads, a guide and answers that cite them, Studio tools that make artifacts from them,
 * notes, and the chats filed under it. An organisation library opens here too, read-only, to copy.
 */
@Component({
  selector: 'dn-project-page',
  imports: [FormsModule, RouterLink, Button, Checkbox, CitedAnswer, SegmentedControl, SharePanel, Switch],
  templateUrl: './project-page.html',
  styleUrl: './project-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ProjectPage {
  /** From the route: a project of yours… */
  readonly projectId = input<string>();
  /** …or an organisation library. */
  readonly libraryId = input<string>();

  readonly #http = inject(HttpClient);
  readonly #title = inject(Title);
  readonly #router = inject(Router);

  protected readonly project = httpResource<Project>(() =>
    this.libraryId()
      ? `/api/projects/libraries/${encodeURIComponent(this.libraryId()!)}`
      : this.projectId()
        ? `/api/projects/${encodeURIComponent(this.projectId()!)}`
        : undefined,
  );
  protected readonly p = computed(() => (this.project.hasValue() ? this.project.value() : null));
  protected readonly kind = KIND;
  protected readonly tools = TOOLS;
  protected readonly levels = LEVELS;
  protected readonly now = new Date();
  protected readonly selectedCount = computed(() => this.p()?.sources.filter((s) => s.selected).length ?? 0);
  protected readonly allSelected = computed(
    () => !!this.p()?.sources.length && this.selectedCount() === this.p()!.sources.length,
  );
  protected readonly citedSources = computed<CitedSource[]>(
    () => this.p()?.sources.map((s) => ({ id: s.id, title: s.title, site: s.meta })) ?? [],
  );

  protected readonly answer = signal<ProjectAnswer | null>(null);
  protected readonly asking = signal(false);
  protected readonly status = signal('');
  protected question = '';

  /** Side columns fold away to give the guide room; the choice lasts while the page is open. */
  protected readonly showSources = signal(true);
  protected readonly showStudio = signal(true);

  // Source search
  protected readonly searchScopes: SegmentOption[] = [
    { value: 'all', label: 'Everywhere' },
    { value: 'workspace', label: 'Workspace' },
    { value: 'web', label: 'Web' },
  ];
  protected readonly searchDepths: SegmentOption[] = [
    { value: 'quick', label: 'Quick' },
    { value: 'deep', label: 'Deep' },
  ];
  protected searchQuery = '';
  protected readonly searchScope = signal<SourceSearch['scope']>('all');
  protected readonly searchDepth = signal<SourceSearch['depth']>('quick');
  protected readonly searching = signal(false);
  protected readonly found = signal<SourceSearchResult | null>(null);

  // Studio
  protected readonly making = signal<NewOutput['tool'] | null>(null);

  // Sharing
  private readonly shareDialog = viewChild<ElementRef<HTMLDialogElement>>('shareDialog');
  protected readonly directory = httpResource<Recipient[]>(() =>
    this.projectId() ? '/api/projects/directory' : undefined,
  );
  protected readonly sharing = signal(false);
  protected readonly access = computed<ShareGrant[]>(
    () => this.p()?.sharedWith.map((g) => ({ recipient: toRecipient(g.recipient), level: g.level })) ?? [],
  );
  protected readonly directoryPeople = computed<ShareRecipient[]>(() =>
    this.directory.hasValue() ? this.directory.value().map(toRecipient) : [],
  );

  /** Who may be added: anyone, except that a Restricted project goes to named people, not whole teams. */
  protected readonly entitled: ShareEntitlementCheck = (recipient) =>
    this.p()?.sensitivity === 'Restricted' && recipient.kind === 'group'
      ? { status: 'denied', reason: 'Restricted projects are shared with named people only' }
      : { status: 'allowed' };

  constructor() {
    effect(() => {
      const p = this.p();
      if (p) this.#title.setTitle(`${p.name} · Projects · Donovan`);
    });
  }

  protected segments(text: CitedText): CitedSegment[] {
    return text.map((s) => ({ text: s.text, ...(s.cite.length ? { cite: s.cite } : {}) }));
  }

  protected when(iso: string): string {
    return relativeDay(iso, this.now);
  }

  protected async toggleSource(source: ProjectSource, event: CustomEvent<{ value: unknown }>): Promise<void> {
    event.preventDefault();
    await this.change(() =>
      this.#http.put<void>(this.url(`sources/${source.id}/selected`), { selected: event.detail.value === true }),
    );
  }

  protected async selectAll(selected: boolean): Promise<void> {
    await this.change(() => this.#http.put<void>(this.url('sources/selected'), { selected }));
    this.status.set(selected ? 'All sources selected.' : 'No sources selected.');
  }

  protected async setCalibrated(event: CustomEvent<{ value: unknown }>): Promise<void> {
    event.preventDefault();
    await this.change(() => this.#http.patch(this.url(''), { calibrated: event.detail.value === true }));
  }

  protected async addSources(sources: SourceCandidate[]): Promise<void> {
    await this.change(() =>
      this.#http.post<void>(this.url('sources'), {
        sources: sources.map(({ kind, title, meta }) => ({ kind, title, meta })),
      }),
    );
    const titles = new Set(sources.map((s) => s.title));
    const f = this.found();
    if (f) this.found.set({ ...f, results: f.results.filter((r) => !titles.has(r.title)) });
    this.status.set(sources.length === 1 ? 'Source added.' : `${sources.length} sources added.`);
  }

  protected async search(): Promise<void> {
    const query = this.searchQuery.trim();
    if (!query) return;
    this.searching.set(true);
    this.status.set(this.searchDepth() === 'deep' ? 'Searching deeply…' : 'Searching…');
    try {
      const result = await firstValueFrom(
        this.#http.post<SourceSearchResult>(this.url('source-search'), {
          query,
          scope: this.searchScope(),
          depth: this.searchDepth(),
        }),
      );
      this.found.set(result);
      this.status.set(`Found ${result.results.length} of ${result.searched} looked at.`);
    } catch {
      toast.error("The search didn't finish", { description: 'Try again in a moment.' });
    } finally {
      this.searching.set(false);
    }
  }

  protected pickScope(e: CustomEvent<{ value: unknown }>): void {
    this.searchScope.set(e.detail.value as SourceSearch['scope']);
  }

  protected pickDepth(e: CustomEvent<{ value: unknown }>): void {
    this.searchDepth.set(e.detail.value as SourceSearch['depth']);
  }

  protected async ask(question: string): Promise<void> {
    const q = question.trim();
    if (!q) return;
    this.asking.set(true);
    this.status.set(`Reading ${this.selectedCount()} sources…`);
    try {
      this.answer.set(await firstValueFrom(this.#http.post<ProjectAnswer>(this.url('ask'), { question: q })));
      this.status.set('Answer ready.');
      this.question = '';
    } catch (err) {
      const message = (err as { error?: { message?: string } }).error?.message;
      this.status.set('');
      toast.error("Couldn't answer that", { description: message ?? 'Try again in a moment.' });
    } finally {
      this.asking.set(false);
    }
  }

  protected saveAnswer(): Promise<void> {
    const a = this.answer();
    return a ? this.addNote(`${a.question}\n\n${a.answer.map((s) => s.text).join('')}`) : Promise.resolve();
  }

  protected saveGuide(p: Project): Promise<void> {
    return this.addNote(`Project guide\n\n${p.guide.map((s) => s.text).join('')}`);
  }

  protected async copyGuide(p: Project): Promise<void> {
    await navigator.clipboard.writeText(p.guide.map((s) => s.text).join(''));
    toast.success('Guide copied');
  }

  protected async addNote(text: string): Promise<void> {
    await this.change(() => this.#http.post<void>(this.url('notes'), { text }));
    this.status.set('Saved to notes.');
  }

  protected async deleteNote(id: string): Promise<void> {
    await this.change(() => this.#http.delete<void>(this.url(`notes/${id}`)));
    this.status.set('Note deleted.');
  }

  protected async make(tool: NewOutput['tool']): Promise<void> {
    this.making.set(tool);
    this.status.set('Making it from the selected sources…');
    try {
      const made = await firstValueFrom(this.#http.post<ArtifactSummary>(this.url('outputs'), { tool }));
      this.project.reload();
      this.status.set(`${made.name} is ready.`);
      toast.success(`Made ${made.name}`, {
        action: { label: 'Open', onClick: () => void this.#router.navigate(['/artifacts', made.id]) },
      });
    } catch (err) {
      const message = (err as { error?: { message?: string } }).error?.message;
      this.status.set('');
      toast.error("Couldn't make that", { description: message ?? 'Try again in a moment.' });
    } finally {
      this.making.set(null);
    }
  }

  protected openShare(): void {
    this.shareDialog()?.nativeElement.showModal();
  }

  protected closeShare(): void {
    this.shareDialog()?.nativeElement.close();
  }

  protected async share(event: CustomEvent<ShareSubmit>): Promise<void> {
    event.preventDefault();
    this.sharing.set(true);
    try {
      const access = event.detail.access.map((g) => ({
        recipient: {
          id: g.recipient.id,
          kind: g.recipient.kind,
          name: g.recipient.name,
          ...(g.recipient.detail ? { detail: g.recipient.detail } : {}),
        },
        level: g.level,
      }));
      await firstValueFrom(this.#http.put<void>(this.url('shares'), { access }));
      this.project.reload();
      this.closeShare();
      toast.success('Sharing updated', { description: access.length ? `${access.length} with access` : 'Only you' });
    } catch {
      toast.error("Couldn't update sharing", { description: 'Try again in a moment.' });
    } finally {
      this.sharing.set(false);
    }
  }

  protected async copyLibrary(p: Project): Promise<void> {
    try {
      const made = await firstValueFrom(
        this.#http.post<ProjectSummary>('/api/projects', {
          name: p.name,
          sensitivity: 'Internal',
          calibrated: false,
          fromLibrary: p.id,
        }),
      );
      toast.success(`Copied ${p.name} to your projects`);
      await this.#router.navigate(['/projects', made.id]);
    } catch {
      toast.error("Couldn't copy the library", { description: 'Try again in a moment.' });
    }
  }

  private url(path: string): string {
    return `/api/projects/${encodeURIComponent(this.projectId() ?? '')}${path ? `/${path}` : ''}`;
  }

  private async change(call: () => ReturnType<HttpClient['post']>): Promise<void> {
    try {
      await firstValueFrom(call());
      this.project.reload();
    } catch {
      toast.error("Couldn't save that", { description: 'Try again in a moment.' });
    }
  }
}

function toRecipient(r: Recipient): ShareRecipient {
  return { id: r.id, kind: r.kind, name: r.name, ...(r.detail ? { detail: r.detail } : {}) };
}
