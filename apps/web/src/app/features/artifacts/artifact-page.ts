import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, linkedSignal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { CodeBlock } from '@adamstavely/trenchcoat/angular/code-block';
import { DataTable } from '@adamstavely/trenchcoat/angular/data-table';
import { MeterRow } from '@adamstavely/trenchcoat/angular/meter-row';
import { SegmentedControl } from '@adamstavely/trenchcoat/angular/segmented-control';
import type { SegmentOption } from '@adamstavely/trenchcoat/segmented-control';
import { toast } from '@adamstavely/trenchcoat/toaster';
import type { Artifact } from '@donovan/contracts';
import { relativeDay } from '../brief/format';
import { tableFor } from '../chats/blocks';
import { artifactText, blocksAt, downloadName } from './artifact-view';

/** One artifact: its body at the version picked, what changed, and where it came from. */
@Component({
  selector: 'dn-artifact-page',
  imports: [RouterLink, Button, CodeBlock, DataTable, MeterRow, SegmentedControl],
  templateUrl: './artifact-page.html',
  styleUrl: './artifact-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ArtifactPage {
  /** From the route. */
  readonly artifactId = input.required<string>();
  readonly #title = inject(Title);

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
  protected readonly blocks = computed(() => {
    const a = this.a();
    return a?.body.kind === 'Doc' ? blocksAt(a.body.blocks, this.version()) : [];
  });
  protected readonly dataTable = computed(() => {
    const body = this.a()?.body;
    return body?.kind === 'Data' ? tableFor({ type: 'table', columns: body.columns, rows: body.rows }) : null;
  });
  protected readonly tableFor = tableFor;
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

  protected barMax(items: { value: number }[]): number {
    return Math.max(...items.map((i) => i.value));
  }

  protected pickVersion(event: CustomEvent<{ value: unknown }>): void {
    this.version.set(Number(event.detail.value));
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
