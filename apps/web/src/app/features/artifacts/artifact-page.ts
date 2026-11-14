import { HttpClient, httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { SegmentedControl } from '@adamstavely/trenchcoat/angular/segmented-control';
import type { SegmentOption } from '@adamstavely/trenchcoat/segmented-control';
import { toast } from '@adamstavely/trenchcoat/toaster';
import type { Artifact, ArtifactKind, ProjectsOverview } from '@donovan/contracts';
import { firstValueFrom } from 'rxjs';
import { IconDirective } from '../../core/icon.directive';
import type { IconName } from '../../core/icons';
import { initials, relativeDay } from '../brief/format';
import { ArtifactBody } from './artifact-body';
import { artifactText, downloadName } from './artifact-view';

/** One artifact: its body at the version picked, what changed, and where it came from. */
@Component({
  selector: 'dn-artifact-page',
  imports: [FormsModule, RouterLink, Button, ArtifactBody, IconDirective, SegmentedControl],
  templateUrl: './artifact-page.html',
  styleUrl: './artifact-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ArtifactPage {
  /** From the route. */
  readonly artifactId = input.required<string>();
  /** On a project shared with the person: whose project, and which (the artifact is read through the share). */
  readonly ownerId = input<string>();
  readonly projectId = input<string>();
  readonly #title = inject(Title);
  readonly #http = inject(HttpClient);

  // Save to project
  private readonly projectDialog = viewChild.required<ElementRef<HTMLDialogElement>>('projectDialog');
  readonly #wantProjects = signal(false);
  protected readonly projects = httpResource<ProjectsOverview>(() =>
    this.#wantProjects() ? '/api/projects' : undefined,
  );
  protected projectChoice = '';
  protected readonly saving = signal(false);

  protected readonly artifact = httpResource<Artifact>(() =>
    this.ownerId() && this.projectId()
      ? `/api/projects/shared/${encodeURIComponent(this.ownerId()!)}/${encodeURIComponent(this.projectId()!)}/artifacts/${encodeURIComponent(this.artifactId())}`
      : `/api/artifacts/${encodeURIComponent(this.artifactId())}`,
  );
  /** Read through a share: it can be read, copied and downloaded, not filed or continued. */
  protected readonly shared = computed(() => !!this.ownerId());
  protected readonly backLink = computed(() =>
    this.ownerId() ? ['/projects/shared', this.ownerId()!, this.projectId()!] : ['/artifacts'],
  );
  protected readonly a = computed(() => (this.artifact.hasValue() ? this.artifact.value() : null));

  /** The version showing: the latest, until the reader picks another. */
  protected readonly version = linkedSignal(() => this.a()?.version ?? 1);
  protected readonly versionOptions = computed<SegmentOption[]>(
    () => this.a()?.versions.map((v) => ({ value: String(v.version), label: `v${v.version}` })) ?? [],
  );
  protected readonly versionNote = computed(
    () => this.a()?.versions.find((v) => v.version === this.version())?.note ?? '',
  );
  protected readonly now = new Date();
  protected readonly initials = initials;
  /** Newest first, as the details list them. */
  protected readonly reversedVersions = computed(() => [...(this.a()?.versions ?? [])].reverse());
  protected readonly versionAt = computed(
    () => this.a()?.versions.find((v) => v.version === this.version())?.at ?? this.a()?.updatedAt ?? '',
  );
  /** Rendered, or the text it's made of (Markdown, the notebook's source, the raw CSV or JSON). */
  protected readonly mode = signal<'preview' | 'source'>('preview');
  protected readonly modes = computed<SegmentOption[]>(() => {
    const body = this.a()?.body;
    const source = !body
      ? 'Source'
      : body.kind === 'Doc'
        ? 'Markdown'
        : body.kind === 'Data'
          ? body.format.toUpperCase()
          : 'Source';
    return [
      { value: 'preview', label: 'Preview' },
      { value: 'source', label: source },
    ];
  });
  protected readonly source = computed(() => {
    const a = this.a();
    return a ? artifactText(a.body, this.version()) : '';
  });
  /** How big it is, in its own terms: a doc's sections, a notebook's cells, a table's rows. */
  protected readonly size = computed(() => {
    const body = this.a()?.body;
    if (!body) return '';
    if (body.kind === 'Doc') {
      const n = body.blocks.filter((b) => b.type === 'heading').length;
      return `${n} ${n === 1 ? 'section' : 'sections'}`;
    }
    if (body.kind === 'Code') return `${body.cells.length} cells`;
    return `${body.rows.length} rows`;
  });

  constructor() {
    effect(() => {
      const a = this.a();
      if (a) this.#title.setTitle(`${a.name} · Artifacts · Donovan`);
    });
  }

  protected when(iso: string): string {
    return relativeDay(iso, this.now);
  }

  protected pickVersion(event: CustomEvent<{ value: unknown }>): void {
    this.version.set(Number(event.detail.value));
  }

  protected pickMode(event: CustomEvent<{ value: unknown }>): void {
    this.mode.set(event.detail.value === 'source' ? 'source' : 'preview');
  }

  protected kindIcon(kind: ArtifactKind): IconName {
    return kind === 'Data' ? 'table' : kind === 'Code' ? 'code' : 'doc';
  }

  protected openSaveToProject(a: Artifact): void {
    this.#wantProjects.set(true);
    this.projectChoice = '';
    if (a.project && this.projects.hasValue())
      this.projectChoice = this.projects.value().mine.find((p) => p.name === a.project)?.id ?? '';
    this.projectDialog().nativeElement.showModal();
  }

  protected closeSaveToProject(): void {
    this.projectDialog().nativeElement.close();
  }

  protected async saveToProject(a: Artifact): Promise<void> {
    this.saving.set(true);
    try {
      await firstValueFrom(
        this.#http.patch(`/api/artifacts/${encodeURIComponent(a.id)}`, { projectId: this.projectChoice || null }),
      );
      this.artifact.reload();
      this.closeSaveToProject();
      const name = this.projects.hasValue()
        ? this.projects.value().mine.find((p) => p.id === this.projectChoice)?.name
        : undefined;
      toast.success(name ? `Saved to ${name}` : 'Taken out of its project');
    } catch {
      toast.error("Couldn't save to the project", { description: 'Try again in a moment.' });
    } finally {
      this.saving.set(false);
    }
  }

  protected async copy(a: Artifact): Promise<void> {
    await navigator.clipboard.writeText(artifactText(a.body, this.version()));
    toast.success('Copied to the clipboard');
  }

  protected download(a: Artifact): void {
    const { name, type } = downloadName(a);
    const url = URL.createObjectURL(new Blob([artifactText(a.body, this.version())], { type }));
    Object.assign(document.createElement('a'), { href: url, download: name }).click();
    URL.revokeObjectURL(url);
  }
}
