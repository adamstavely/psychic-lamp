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
import type { Artifact, ProjectsOverview } from '@donovan/contracts';
import { firstValueFrom } from 'rxjs';
import { relativeDay } from '../brief/format';
import { ArtifactBody } from './artifact-body';
import { artifactText, downloadName } from './artifact-view';

/** One artifact: its body at the version picked, what changed, and where it came from. */
@Component({
  selector: 'dn-artifact-page',
  imports: [FormsModule, RouterLink, Button, ArtifactBody, SegmentedControl],
  templateUrl: './artifact-page.html',
  styleUrl: './artifact-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ArtifactPage {
  /** From the route. */
  readonly artifactId = input.required<string>();
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

  protected readonly artifact = httpResource<Artifact>(() => `/api/artifacts/${encodeURIComponent(this.artifactId())}`);
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
