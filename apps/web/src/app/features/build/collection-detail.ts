import { HttpClient, httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { Dialog } from '@adamstavely/trenchcoat/angular/dialog';
import { Select } from '@adamstavely/trenchcoat/angular/select';
import type { SelectOption } from '@adamstavely/trenchcoat/select';
import { toast } from '@adamstavely/trenchcoat/toaster';
import type { AttachResult, CollectionAttachment, RegistryItem, RegistrySummary } from '@donovan/contracts';
import { firstValueFrom } from 'rxjs';
import { ownOpenChange } from './dialog-events';
import { ProjectsStore } from '../../core/projects-store';
import { linked } from './registry-links';

type Collection = Extract<RegistryItem, { kind: 'collection' }>;

const KIND_LABEL: Record<string, string> = {
  skill: 'Skill',
  server: 'Server',
  agent: 'Agent',
  workflow: 'Workflow',
  model: 'Model',
  dataset: 'Dataset',
  space: 'Space',
  collection: 'Collection',
  prompt: 'Prompt',
};

/** A collection: a bundle of registry items, as sensitive as its most sensitive member, attached to projects whole. */
@Component({
  selector: 'dn-collection-detail',
  imports: [RouterLink, Button, Dialog, Select],
  templateUrl: './collection-detail.html',
  styleUrl: './detail.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectionDetail {
  readonly item = input.required<Collection>();
  readonly #http = inject(HttpClient);
  readonly #projects = inject(ProjectsStore);
  readonly #registry = httpResource<RegistrySummary[]>(() => '/api/registry');

  protected readonly kindLabel = KIND_LABEL;
  /** Each member, with its tier and page when the registry has it. */
  protected readonly members = computed(() => {
    const all = this.#registry.hasValue() ? this.#registry.value() : [];
    return this.item().details.members.map((m) => ({ kind: m.kind, ...linked(all, m.kind, m) }));
  });

  protected readonly attached = httpResource<CollectionAttachment[]>(
    () => `/api/registry/collection/${encodeURIComponent(this.item().id)}/projects`,
  );
  protected readonly myProjects = this.#projects.mine;

  protected readonly projectOptions = computed<SelectOption[]>(() =>
    this.myProjects().map((p) => ({ value: p.id, label: `${p.name} · ${p.sensitivity}` })),
  );
  protected readonly own = ownOpenChange;
  protected readonly attachOpen = signal(false);
  protected readonly projectId = signal('');
  protected readonly attaching = signal(false);

  protected openAttach(): void {
    this.projectId.set(this.myProjects()[0]?.id ?? '');
    this.attachOpen.set(true);
  }

  protected async attach(): Promise<void> {
    const projectId = this.projectId();
    if (!projectId) return;
    this.attaching.set(true);
    try {
      const url = `/api/registry/collection/${encodeURIComponent(this.item().id)}/projects`;
      const res = await firstValueFrom(this.#http.post<AttachResult>(url, { projectId }));
      this.attached.set(res.attachments);
      const name = res.attachments.find((a) => a.projectId === projectId)?.project ?? 'the project';
      toast.success(`Attached ${this.item().name} to ${name}`, {
        description: res.raised
          ? `${name} is now ${res.raised.to}, up from ${res.raised.from}, to match the collection.`
          : undefined,
      });
      // A raised tier shows on the project everywhere it's listed.
      if (res.raised) this.#projects.overview.reload();
      this.attachOpen.set(false);
    } catch (err) {
      toast.error("Couldn't attach it", {
        description: (err as { error?: { message?: string } }).error?.message ?? 'Try again in a moment.',
      });
    } finally {
      this.attaching.set(false);
    }
  }

  protected async detach(a: CollectionAttachment): Promise<void> {
    try {
      const url = `/api/registry/collection/${encodeURIComponent(this.item().id)}/projects/${encodeURIComponent(a.projectId)}`;
      this.attached.set(await firstValueFrom(this.#http.delete<CollectionAttachment[]>(url)));
      toast.success(`Took ${this.item().name} off ${a.project}`, {
        description: `${a.project} keeps its tier; change it on the project if it should be lower.`,
      });
    } catch {
      toast.error("Couldn't take it off", { description: 'Try again in a moment.' });
    }
  }
}
