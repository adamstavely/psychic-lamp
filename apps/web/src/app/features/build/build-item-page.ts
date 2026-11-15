import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import type { RegistryItem } from '@donovan/contracts';
import { BUILD_AREAS } from '../../shell/areas';
import { AgentDetail } from './agent-detail';
import { CollectionDetail } from './collection-detail';
import { DatasetDetail } from './dataset-detail';
import { ModelDetail } from './model-detail';
import { SpaceDetail } from './space-detail';
import { ServerDetail } from './server-detail';

const STATUS: Record<RegistryItem['status'], string> = {
  draft: 'Draft',
  pending: 'Waiting for review',
  'changes-requested': 'Changes requested',
  published: 'Published',
  rejected: 'Rejected',
};

/** One registry item, on its kind's page; skills, prompts and workflows show their essentials until step 6. */
@Component({
  selector: 'dn-build-item-page',
  imports: [RouterLink, AgentDetail, CollectionDetail, DatasetDetail, ModelDetail, ServerDetail, SpaceDetail],
  template: `
    <section class="page">
      @if (buildArea(); as a) {
        <a class="back" [routerLink]="a.path">Back to {{ a.label }}</a>
        @if (item.hasValue()) {
          @let i = item.value();
          @switch (i.kind) {
            @case ('server') {
              <dn-server-detail [item]="i" />
            }
            @case ('agent') {
              <dn-agent-detail [item]="i" />
            }
            @case ('model') {
              <dn-model-detail [item]="i" />
            }
            @case ('dataset') {
              <dn-dataset-detail [item]="i" />
            }
            @case ('space') {
              <dn-space-detail [item]="i" />
            }
            @case ('collection') {
              <dn-collection-detail [item]="i" />
            }
            @default {
              <h1>{{ i.name }}</h1>
              <dl>
                <dt>Id</dt>
                <dd>{{ i.slug }} · {{ i.version }}</dd>
                <dt>Owner</dt>
                <dd>{{ i.owner.name }}</dd>
                <dt>Sensitivity</dt>
                <dd>
                  <span class="dn-sens" [attr.data-level]="i.sensitivity">{{ i.sensitivity }}</span>
                </dd>
                <dt>Status</dt>
                <dd>{{ status(i.status) }}</dd>
              </dl>
              <p>{{ i.summary }}</p>
            }
          }
        } @else if (item.error()) {
          <h1>Not found</h1>
          <p role="alert">There's no {{ a.label.toLowerCase() }} item with that id, or it isn't shared with you.</p>
        } @else {
          <p role="status">Loading…</p>
        }
      } @else {
        <h1>Page not found</h1>
        <p>There's no Build area called that. <a routerLink="/build/skills">Go to Skills</a>.</p>
      }
    </section>
  `,
  styles: `
    .page {
      max-width: 72rem;
      padding: var(--tc-space-8);
    }
    .back {
      display: inline-block;
      margin-block-end: var(--tc-space-4);
    }
    h1 {
      margin: 0 0 var(--tc-space-4);
      font-size: var(--tc-font-size-2xl);
    }
    dl {
      display: grid;
      grid-template-columns: max-content minmax(0, 1fr);
      gap: var(--tc-space-2) var(--tc-space-6);
      margin: 0 0 var(--tc-space-4);
    }
    dt {
      color: var(--tc-text-secondary);
    }
    dd {
      margin: 0;
    }
    @media (max-width: 600px) {
      .page {
        padding-inline: var(--tc-space-4);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class BuildItemPage {
  constructor() {
    const title = inject(Title);
    effect(() =>
      title.setTitle(
        `${this.item.hasValue() ? this.item.value().name : this.buildArea() ? this.buildArea()!.label : 'Page not found'} · Donovan`,
      ),
    );
  }

  /** From the route. */
  readonly area = input<string>('');
  readonly itemId = input<string>('');
  protected readonly buildArea = computed(() => BUILD_AREAS.find((a) => a.id === this.area() && a.kind));
  protected readonly item = httpResource<RegistryItem>(() => {
    const kind = this.buildArea()?.kind;
    return kind && this.itemId() ? `/api/registry/${kind}/${encodeURIComponent(this.itemId())}` : undefined;
  });
  protected status(s: RegistryItem['status']): string {
    return STATUS[s];
  }
}
