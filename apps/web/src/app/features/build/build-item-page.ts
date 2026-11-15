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
import { PromptDetail } from './prompt-detail';
import { SkillDetail } from './skill-detail';
import { SpaceDetail } from './space-detail';
import { WorkflowDetail } from './workflow-detail';
import { ReviewStatus } from './review-status';
import { ServerDetail } from './server-detail';

/** One registry item, on its kind's page. */
@Component({
  selector: 'dn-build-item-page',
  imports: [
    RouterLink,
    AgentDetail,
    CollectionDetail,
    DatasetDetail,
    ModelDetail,
    PromptDetail,
    ReviewStatus,
    ServerDetail,
    SkillDetail,
    SpaceDetail,
    WorkflowDetail,
  ],
  template: `
    <section class="page">
      @if (buildArea(); as a) {
        <a class="back" [routerLink]="a.path">Back to {{ a.label }}</a>
        @if (item.hasValue()) {
          @let i = item.value();
          @if (i.status !== 'published') {
            <dn-review-status [item]="i" (changed)="item.reload()" />
          }
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
            @case ('skill') {
              <dn-skill-detail [item]="i" />
            }
            @case ('prompt') {
              <dn-prompt-detail [item]="i" />
            }
            @case ('workflow') {
              <dn-workflow-detail [item]="i" />
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
}
