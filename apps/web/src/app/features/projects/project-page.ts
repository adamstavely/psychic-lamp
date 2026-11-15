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
import { ClaimAnswer } from '@adamstavely/trenchcoat/angular/claim-answer';
import { SharePanel } from '@adamstavely/trenchcoat/angular/share-panel';
import { Switch } from '@adamstavely/trenchcoat/angular/switch';
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
  NewOutput,
  NewSource,
  SourceCatalog,
  Project,
  ProjectAnswer,
  ProjectSource,
  ProjectSummary,
  Recipient,
  SourceCandidate,
  SourceSearch,
  SourceSearchResult,
} from '@donovan/contracts';
import { UPLOAD_LIMIT_BYTES } from '@donovan/contracts/defaults';
import { firstValueFrom } from 'rxjs';
import { IconDirective } from '../../core/icon.directive';
import { ProjectsStore } from '../../core/projects-store';
import type { IconName } from '../../core/icons';
import { clockTime } from '../brief/format';
import { claimsFor } from '../chats/blocks';

const DATE = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

const KIND_ICON: Record<ProjectSource['kind'], IconName> = {
  pdf: 'doc',
  sheet: 'table',
  doc: 'doc',
  slack: 'chat',
  connector: 'database',
  web: 'link',
  dataset: 'database',
};

const TOOLS: { tool: NewOutput['tool']; label: string; hint: string; icon: IconName }[] = [
  { tool: 'brief', label: 'Brief', hint: 'A one-page summary of the selected sources', icon: 'list' },
  { tool: 'report', label: 'Report', hint: 'Summary, what each source adds, open questions', icon: 'doc' },
  { tool: 'deck', label: 'Slide deck', hint: 'A slide outline to paste into your deck tool', icon: 'presentation' },
  { tool: 'table', label: 'Data table', hint: 'Each source, its kind and detail', icon: 'table' },
  { tool: 'mindmap', label: 'Mind map', hint: 'The sources grouped by kind, with the questions', icon: 'network' },
  { tool: 'faq', label: 'FAQ', hint: "The project's questions, answered", icon: 'help' },
  { tool: 'quiz', label: 'Quiz', hint: 'True-or-false questions from the sources', icon: 'check' },
  { tool: 'audio', label: 'Audio overview', hint: 'A two-voice script about the sources', icon: 'headphones' },
  { tool: 'timeline', label: 'Timeline', hint: 'What each source adds, in order', icon: 'clock' },
];

const SCOPES: { value: SourceSearch['scope']; label: string }[] = [
  { value: 'all', label: 'Everywhere' },
  { value: 'workspace', label: 'Workspace' },
  { value: 'web', label: 'Web' },
  { value: 'connectors', label: 'Connectors' },
];

type AddMode = NewSource['from'];

/** The Add sources menu, as the prototype lists it. */
const WAYS: { mode: AddMode; label: string; hint: string; icon: IconName }[] = [
  { mode: 'upload', label: 'Upload files', hint: 'PDF, Doc, Sheet, text', icon: 'upload' },
  { mode: 'link', label: 'Website or link', hint: 'A page to read', icon: 'link' },
  { mode: 'connector', label: 'MCP connector', hint: 'A live system, read-only', icon: 'plug' },
  { mode: 'dataset', label: 'Dataset', hint: 'A governed table', icon: 'database' },
  { mode: 'paste', label: 'Paste text', hint: 'Notes, transcripts, emails', icon: 'paste' },
];

/** Files whose text is read and kept with the source; others are added by name. */
const TEXT_FILE = /\.(md|markdown|txt|csv|tsv|json)$/i;
const DEPTHS: { value: SourceSearch['depth']; label: string }[] = [
  { value: 'quick', label: 'Fast search' },
  { value: 'deep', label: 'Deep research' },
];

/** For the pilot, projects are shared to view; editing together is coming later. */
const LEVELS: ShareLevel[] = [{ id: 'viewer', label: 'Can view' }];

/**
 * A project: the sources it reads, a guide and answers that cite them, Studio tools that make artifacts from them,
 * notes, and the chats filed under it. An organisation library opens here too, read-only, to copy.
 */
@Component({
  selector: 'dn-project-page',
  imports: [FormsModule, RouterLink, Button, ClaimAnswer, IconDirective, SharePanel, Switch],
  templateUrl: './project-page.html',
  styleUrl: './project-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ProjectPage {
  /** From the route: a project of yours… */
  readonly projectId = input<string>();
  /** …or an organisation library… */
  readonly libraryId = input<string>();
  /** …or someone else's project shared with the person (with projectId). */
  readonly ownerId = input<string>();

  readonly #http = inject(HttpClient);
  readonly #title = inject(Title);
  readonly #router = inject(Router);
  readonly #projects = inject(ProjectsStore);

  protected readonly project = httpResource<Project>(() =>
    this.libraryId()
      ? `/api/projects/libraries/${encodeURIComponent(this.libraryId()!)}`
      : this.ownerId() && this.projectId()
        ? `/api/projects/shared/${encodeURIComponent(this.ownerId()!)}/${encodeURIComponent(this.projectId()!)}`
        : this.projectId()
          ? `/api/projects/${encodeURIComponent(this.projectId()!)}`
          : undefined,
  );
  protected readonly p = computed(() => (this.project.hasValue() ? this.project.value() : null));
  protected readonly tools = TOOLS;
  protected readonly levels = LEVELS;
  protected readonly selectedCount = computed(() => this.p()?.sources.filter((s) => s.selected).length ?? 0);
  protected readonly allSelected = computed(
    () => !!this.p()?.sources.length && this.selectedCount() === this.p()!.sources.length,
  );
  protected readonly asking = signal(false);
  protected readonly status = signal('');
  protected question = '';

  /** Side columns fold away to give the guide room; the choice lasts while the page is open. */
  protected readonly showSources = signal(true);
  protected readonly showStudio = signal(true);
  // Add sources
  protected readonly ways = WAYS;
  protected readonly addOpen = signal(false);
  protected readonly addMode = signal<AddMode | null>(null);
  protected readonly adding = signal(false);
  protected readonly addError = signal('');
  protected linkUrl = '';
  protected pasteTitle = '';
  protected pasteText = '';
  /** Loaded the first time someone opens the connector or dataset list. */
  readonly #wantCatalog = signal(false);
  protected readonly catalog = httpResource<SourceCatalog>(() =>
    this.#wantCatalog() ? '/api/projects/source-catalog' : undefined,
  );
  protected readonly catalogConnectors = computed(() =>
    this.catalog.hasValue() ? this.catalog.value().connectors : [],
  );
  protected readonly catalogDatasets = computed(() => (this.catalog.hasValue() ? this.catalog.value().datasets : []));
  /** Search results added this visit: they stay in the list, marked Added. */
  protected readonly added = signal<ReadonlySet<string>>(new Set());
  /** The source a citation chip just pointed at, highlighted for a moment. */
  protected readonly flashed = signal<string | null>(null);

  // Source search
  protected searchQuery = '';
  protected readonly searchScope = signal<SourceSearch['scope']>('all');
  protected readonly searchDepth = signal<SourceSearch['depth']>('quick');
  protected readonly scopeLabel = computed(() => SCOPES.find((x) => x.value === this.searchScope())!.label);
  protected readonly depthLabel = computed(() => DEPTHS.find((x) => x.value === this.searchDepth())!.label);
  protected readonly searching = signal(false);
  protected readonly found = signal<SourceSearchResult | null>(null);

  // Studio
  protected readonly making = signal<NewOutput['tool'] | null>(null);
  protected readonly makingLabel = computed(() => TOOLS.find((t) => t.tool === this.making())?.label ?? '');

  // Notes: a new one being written, or one being edited (by id)
  protected readonly writing = signal(false);
  protected readonly editing = signal<string | null>(null);
  protected draftNote = '';

  // Sharing
  private readonly shareDialog = viewChild<ElementRef<HTMLDialogElement>>('shareDialog');
  protected readonly directory = httpResource<Recipient[]>(() =>
    this.projectId() && !this.ownerId() ? '/api/projects/directory' : undefined,
  );
  protected readonly sharing = signal(false);
  protected readonly access = computed<ShareGrant[]>(
    () => this.p()?.sharedWith.map((g) => ({ recipient: toRecipient(g.recipient), level: g.level })) ?? [],
  );
  protected readonly directoryPeople = computed<ShareRecipient[]>(() =>
    this.directory.hasValue() ? this.directory.value().map(toRecipient) : [],
  );

  /** Who may be added: people (the API checks again, and teams aren't offered until sign-in says who's in them). */
  protected readonly entitled: ShareEntitlementCheck = (recipient) =>
    recipient.kind === 'group'
      ? { status: 'denied', reason: 'Projects are shared with named people for now' }
      : { status: 'allowed' };

  constructor() {
    effect(() => {
      const p = this.p();
      if (p) this.#title.setTitle(`${p.name} · Projects · Donovan`);
    });
  }

  /** An output's page: the person's own artifact, or, on a shared project, the shared copy of it. */
  protected artifactLink(artifactId: string): string[] {
    const owner = this.ownerId();
    return owner ? ['/projects/shared', owner, this.projectId()!, 'artifacts', artifactId] : ['/artifacts', artifactId];
  }

  protected date(iso: string): string {
    return DATE.format(new Date(iso));
  }

  protected time(iso: string): string {
    return clockTime(iso);
  }

  protected kindIcon(kind: ProjectSource['kind']): IconName {
    return KIND_ICON[kind];
  }

  /** An output's icon from its kind ("Doc · v2", "Data · v1"…). */
  protected outputIcon(meta: string): IconName {
    return meta.startsWith('Data') ? 'table' : meta.startsWith('Code') ? 'code' : 'doc';
  }

  /** A citation's number: its source's place in the list, as the chips in the prose show it. */
  protected number(sourceId: string): number {
    return (this.p()?.sources.findIndex((s) => s.id === sourceId) ?? -1) + 1;
  }

  protected sourceTitle(sourceId: string): string {
    return this.p()?.sources.find((s) => s.id === sourceId)?.title ?? 'a source';
  }

  /** A citation chip shows its source: the Sources column opens and the source is scrolled to and highlighted. */
  protected goToSource(sourceId: string): void {
    this.showSources.set(true);
    this.flashed.set(sourceId);
    this.status.set(`Source ${this.number(sourceId)}: ${this.sourceTitle(sourceId)}`);
    requestAnimationFrame(() =>
      document.getElementById(`source-${sourceId}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
    );
    setTimeout(() => this.flashed.set(null), 1600);
  }

  protected cycleScope(): void {
    const i = SCOPES.findIndex((x) => x.value === this.searchScope());
    this.searchScope.set(SCOPES[(i + 1) % SCOPES.length]!.value);
  }

  protected cycleDepth(): void {
    const i = DEPTHS.findIndex((x) => x.value === this.searchDepth());
    this.searchDepth.set(DEPTHS[(i + 1) % DEPTHS.length]!.value);
  }

  protected async toggleSource(source: ProjectSource, event: Event): Promise<void> {
    const selected = (event.target as HTMLInputElement).checked;
    await this.change(() => this.#http.put<void>(this.url(`sources/${source.id}/selected`), { selected }));
  }

  protected async selectAll(selected: boolean): Promise<void> {
    await this.change(() => this.#http.put<void>(this.url('sources/selected'), { selected }));
    this.status.set(selected ? 'All sources selected.' : 'No sources selected.');
  }

  protected async setCalibrated(event: CustomEvent<{ value: unknown }>): Promise<void> {
    event.preventDefault();
    await this.change(() => this.#http.patch(this.url(''), { calibrated: event.detail.value === true }));
    // New chats started in it follow the project's mode.
    this.#projects.overview.reload();
  }

  protected async addSources(sources: SourceCandidate[]): Promise<void> {
    await this.change(() =>
      this.#http.post<void>(this.url('sources'), {
        sources: sources.map(({ kind, title, meta }) => ({ kind, title, meta })),
      }),
    );
    this.added.update((a) => new Set([...a, ...sources.map((s) => s.title)]));
    this.status.set(sources.length === 1 ? 'Source added.' : `${sources.length} sources added.`);
  }

  protected notAdded(results: SourceCandidate[]): SourceCandidate[] {
    const a = this.added();
    return results.filter((r) => !a.has(r.title));
  }

  protected toggleAdd(): void {
    this.addOpen.update((open) => !open);
    this.pickWay(null);
  }

  protected pickWay(mode: AddMode | null): void {
    this.addMode.set(mode);
    this.addError.set('');
    if (mode === 'connector' || mode === 'dataset') this.#wantCatalog.set(true);
  }

  protected async upload(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > UPLOAD_LIMIT_BYTES) {
      this.addError.set(`${file.name} is too big. Files can be up to 512 KB.`);
      return;
    }
    const content = TEXT_FILE.test(file.name) ? await file.text() : '';
    await this.addFrom({ from: 'upload', name: file.name, size: file.size, content });
  }

  protected addLink(): Promise<void> {
    const url = this.linkUrl.trim();
    if (!/^https?:\/\/\S+\.\S+/.test(url)) {
      this.addError.set('Enter a web address that starts with http:// or https://');
      return Promise.resolve();
    }
    return this.addFrom({ from: 'link', url });
  }

  protected addPaste(): Promise<void> {
    if (!this.pasteText.trim()) {
      this.addError.set('Paste some text');
      return Promise.resolve();
    }
    return this.addFrom({
      from: 'paste',
      text: this.pasteText,
      ...(this.pasteTitle.trim() ? { title: this.pasteTitle.trim() } : {}),
    });
  }

  /** Adds one source from the menu; the menu closes and the new source shows, selected. */
  protected async addFrom(body: NewSource): Promise<void> {
    this.adding.set(true);
    this.addError.set('');
    try {
      const made = await firstValueFrom(this.#http.post<ProjectSource>(this.url('sources/new'), body));
      this.project.reload();
      this.linkUrl = this.pasteTitle = this.pasteText = '';
      this.addOpen.set(false);
      this.addMode.set(null);
      this.status.set(`Added ${made.title}.`);
      toast.success(`Added ${made.title}`);
    } catch (err) {
      const message = (err as { error?: { message?: string | string[] } }).error?.message;
      this.addError.set((Array.isArray(message) ? message[0] : message) ?? "Couldn't add that. Try again in a moment.");
    } finally {
      this.adding.set(false);
    }
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

  protected async ask(question: string): Promise<void> {
    const q = question.trim();
    if (!q) return;
    this.asking.set(true);
    this.status.set(`Reading ${this.selectedCount()} sources…`);
    try {
      await firstValueFrom(this.#http.post<ProjectAnswer>(this.url('ask'), { question: q }));
      this.project.reload();
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

  /** A Calibrated answer's claims, as tc-claim-answer takes them. */
  protected claimView(a: ProjectAnswer): ReturnType<typeof claimsFor> {
    return claimsFor({ type: 'claims', items: a.claims ?? [] });
  }

  protected async clearThread(): Promise<void> {
    await this.change(() => this.#http.delete<void>(this.url('thread')));
    this.status.set('Chat cleared.');
  }

  protected saveAnswer(a: ProjectAnswer): Promise<void> {
    return this.addNote(`${a.question}\n\n${a.answer.map((s) => s.text).join('')}`);
  }

  protected async copyAnswer(a: ProjectAnswer): Promise<void> {
    await navigator.clipboard.writeText(a.answer.map((s) => s.text).join(''));
    toast.success('Answer copied');
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

  protected startNote(): void {
    this.showStudio.set(true);
    this.editing.set(null);
    this.draftNote = '';
    this.writing.set(true);
    requestAnimationFrame(() => document.getElementById('note-new')?.focus());
  }

  protected editNote(id: string, text: string): void {
    this.writing.set(false);
    this.draftNote = text;
    this.editing.set(id);
    requestAnimationFrame(() => document.getElementById(`note-edit-${id}`)?.focus());
  }

  protected cancelNote(): void {
    this.writing.set(false);
    this.editing.set(null);
  }

  protected async saveNote(): Promise<void> {
    const text = this.draftNote.trim();
    if (!text) return;
    const id = this.editing();
    if (id) {
      await this.change(() => this.#http.patch<void>(this.url(`notes/${id}`), { text }));
      this.status.set('Note saved.');
    } else await this.addNote(text);
    this.cancelNote();
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
      this.#projects.overview.reload();
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
