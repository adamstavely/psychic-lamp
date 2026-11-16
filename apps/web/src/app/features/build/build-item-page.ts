import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { IconDirective } from '../../core/icon.directive';
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
    IconDirective,
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
    <section [class.dn-build-page]="!isWorkflow()">
      @if (buildArea(); as a) {
        @if (item.hasValue() && item.value().kind === 'workflow') {
          @let wf = item.value();
          @if (wf.kind === 'workflow') {
            <dn-workflow-detail
              [item]="wf"
              [area]="a"
              [edit]="mode() === 'edit'"
              [readonly]="!!proposed()"
              (saved)="item.reload()"
            >
              @if (wf.status !== 'published' || wf.editInReview) {
                <div class="review">
                  <dn-review-status [item]="wf" [proposedView]="!!proposed()" (changed)="item.reload()" />
                </div>
              }
            </dn-workflow-detail>
          }
        } @else {
          <a class="dn-back" [routerLink]="a.path" [attr.aria-label]="'Back to ' + a.label"
            ><span dnIcon="chevron-left" [iconSize]="14"></span>{{ a.label }}</a
          >
          @if (item.hasValue()) {
            @let i = item.value();
            @if (i.status !== 'published' || i.editInReview) {
              <dn-review-status [item]="i" [proposedView]="!!proposed()" (changed)="item.reload()" />
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
            }
          } @else if (item.error()) {
            <h1>Not found</h1>
            <p role="alert">There's no {{ a.label.toLowerCase() }} item with that id, or it isn't shared with you.</p>
          } @else {
            <p role="status">Loading…</p>
          }
        }
      } @else {
        <h1>Page not found</h1>
        <p>There's no Build area called that. <a routerLink="/build/skills">Go to Skills</a>.</p>
      }
    </section>
  `,
  styles: `
    .review {
      padding: var(--tc-space-4) var(--tc-space-6) 0;
    }
    h1 {
      margin: 0 0 var(--tc-space-4);
      font-size: var(--tc-font-size-3xl);
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
  /** ?mode=edit, for a workflow's canvas. */
  readonly mode = input<string>();
  /** ?proposed=1: the edit of a published item that's in review, rather than the published version. */
  readonly proposed = input<string>();
  protected readonly buildArea = computed(() => BUILD_AREAS.find((a) => a.id === this.area() && a.kind));
  protected readonly isWorkflow = computed(() => this.item.hasValue() && this.item.value().kind === 'workflow');
  protected readonly item = httpResource<RegistryItem>(() => {
    const kind = this.buildArea()?.kind;
    if (!kind || !this.itemId()) return undefined;
    return `/api/registry/${kind}/${encodeURIComponent(this.itemId())}${this.proposed() ? '/proposed' : ''}`;
  });
}
