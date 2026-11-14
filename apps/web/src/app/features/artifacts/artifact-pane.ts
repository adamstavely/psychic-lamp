import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { SegmentedControl } from '@adamstavely/trenchcoat/angular/segmented-control';
import type { SegmentOption } from '@adamstavely/trenchcoat/segmented-control';
import { toast } from '@adamstavely/trenchcoat/toaster';
import type { Artifact } from '@donovan/contracts';
import { ArtifactBody } from './artifact-body';
import { artifactText, downloadName } from './artifact-view';

/** An artifact opened beside the chat that made it, without leaving the conversation. */
@Component({
  selector: 'dn-artifact-pane',
  imports: [RouterLink, Button, SegmentedControl, ArtifactBody],
  template: `
    <aside class="pane" aria-labelledby="pane-heading" tabindex="-1">
      @if (artifact.hasValue()) {
        @let a = artifact.value();
        <header class="head">
          <p class="meta">{{ a.kind }} · {{ a.sensitivity }}</p>
          <h2 id="pane-heading">{{ a.name }}</h2>
          <div class="tools">
            @if (a.versions.length > 1) {
              <tc-segmented-control
                size="sm"
                aria-label="Version"
                [options]="versionOptions()"
                [value]="'' + version()"
                (tc-value-change)="pickVersion($event)"
              />
            }
            <tc-button variant="secondary" size="sm" label="Copy" (click)="copy(a)" />
            <tc-button variant="secondary" size="sm" label="Download" (click)="download(a)" />
            <a class="full" [routerLink]="['/artifacts', a.id]">Open full page</a>
            <tc-button variant="ghost" size="sm" label="Close" (click)="closed.emit()" />
          </div>
          <p class="meta">v{{ version() }} · {{ versionNote() }}</p>
        </header>
        <dn-artifact-body [a]="a" [version]="version()" />
        <p class="meta foot">Ask in chat to edit · each edit saves a version</p>
      } @else if (artifact.error()) {
        <h2 id="pane-heading">That artifact isn't here</h2>
        <tc-button variant="ghost" size="sm" label="Close" (click)="closed.emit()" />
      } @else {
        <h2 id="pane-heading" class="sr-only">Artifact</h2>
        <p class="meta" role="status">Loading the artifact…</p>
      }
    </aside>
  `,
  styles: `
    :host {
      display: block;
      min-height: 0;
      overflow: auto;
      border-left: 1px solid var(--tc-border-subtle);
      background: var(--tc-surface-raised);
    }
    .pane {
      display: grid;
      gap: var(--tc-space-3);
      padding: var(--tc-space-4);
    }
    .pane:focus {
      outline: none;
    }
    h2 {
      margin: 0;
      font-size: var(--tc-font-size-lg);
    }
    .meta {
      margin: 0;
      color: var(--tc-text-secondary);
      font-size: var(--tc-font-size-xs);
    }
    .head {
      display: grid;
      gap: var(--tc-space-2);
      padding-bottom: var(--tc-space-3);
      border-bottom: 1px solid var(--tc-border-subtle);
    }
    .tools {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--tc-space-2);
    }
    .full {
      color: var(--tc-accent-text);
      font-size: var(--tc-font-size-sm);
      font-weight: 600;
    }
    .full:focus-visible {
      outline: var(--tc-focus-ring-width) solid var(--tc-focus-ring);
      outline-offset: 2px;
    }
    .foot {
      padding-top: var(--tc-space-2);
      border-top: 1px solid var(--tc-border-subtle);
    }
    @media (max-width: 1100px) {
      :host {
        border-left: 0;
        border-top: 1px solid var(--tc-border-subtle);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArtifactPane {
  readonly artifactId = input.required<string>();
  readonly closed = output<void>();
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  protected readonly artifact = httpResource<Artifact>(() => `/api/artifacts/${encodeURIComponent(this.artifactId())}`);
  protected readonly version = linkedSignal(() => (this.artifact.hasValue() ? this.artifact.value().version : 1));
  protected readonly versionOptions = computed<SegmentOption[]>(() =>
    this.artifact.hasValue()
      ? this.artifact.value().versions.map((v) => ({ value: String(v.version), label: `v${v.version}` }))
      : [],
  );
  protected readonly versionNote = computed(() =>
    this.artifact.hasValue()
      ? (this.artifact.value().versions.find((v) => v.version === this.version())?.note ?? '')
      : '',
  );

  constructor() {
    // Focus moves to the pane when an artifact opens, so keyboard and screen-reader users land in it.
    effect(() => {
      if (this.artifact.hasValue()) queueMicrotask(() => this.#host.querySelector<HTMLElement>('.pane')?.focus());
    });
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
