import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import type { RegistrySummary } from '@donovan/contracts';
import { IconDirective } from '../../core/icon.directive';
import { BUILD_AREAS } from '../../shell/areas';

/**
 * A Build area: what it holds and its items. The full catalog (scopes, cards, actions) and the Insights and Governance
 * pages arrive in the next steps of slice 2 (docs/slice-2-plan.md).
 */
@Component({
  selector: 'dn-build-area-page',
  imports: [RouterLink, IconDirective],
  template: `
    @if (buildArea(); as a) {
      <section class="page">
        <header class="head">
          <h1><span [dnIcon]="a.icon"></span>{{ a.label }}</h1>
          <p>{{ a.description }}</p>
        </header>
        @if (a.kind) {
          @if (items.hasValue()) {
            <p class="count" role="status">
              {{ items.value().length }} {{ items.value().length === 1 ? 'item' : 'items' }}
            </p>
            <ul class="items">
              @for (item of items.value(); track item.id) {
                <li>
                  <a [routerLink]="[a.path, item.id]">{{ item.name }}</a>
                  <span class="slug">{{ item.slug }} · {{ item.version }}</span>
                  <p>{{ item.summary }}</p>
                </li>
              }
            </ul>
          } @else if (items.error()) {
            <p role="alert">Couldn't load {{ a.label }}. Try again in a moment.</p>
          } @else {
            <p role="status">Loading…</p>
          }
        } @else {
          <p class="soon">This page arrives later in Build mode's first release.</p>
        }
      </section>
    } @else {
      <section class="page">
        <h1>Page not found</h1>
        <p>There's no Build area called that. <a routerLink="/build/skills">Go to Skills</a>.</p>
      </section>
    }
  `,
  styles: `
    .page {
      max-width: 60rem;
      padding: var(--tc-space-8);
    }
    .head p,
    .slug,
    .count,
    .soon {
      color: var(--tc-text-secondary);
    }
    h1 {
      display: flex;
      align-items: center;
      gap: var(--tc-space-2);
      margin: 0 0 var(--tc-space-2);
      font-size: var(--tc-font-size-2xl);
    }
    .head p {
      margin: 0 0 var(--tc-space-6);
    }
    .items {
      display: grid;
      gap: var(--tc-space-4);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .items li {
      display: grid;
      gap: var(--tc-space-1);
      padding-block-end: var(--tc-space-4);
      border-block-end: 1px solid var(--tc-border-subtle);
    }
    .items a {
      font-weight: var(--tc-font-weight-semibold);
    }
    .items p {
      margin: 0;
    }
    .slug {
      font-size: var(--tc-font-size-sm);
    }
    @media (max-width: 600px) {
      .page {
        padding-inline: var(--tc-space-4);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class BuildAreaPage {
  constructor() {
    const title = inject(Title);
    effect(() => title.setTitle(`${this.buildArea()?.label ?? 'Page not found'} · Donovan`));
  }

  /** From the route. */
  readonly area = input<string>('');
  protected readonly buildArea = computed(() => BUILD_AREAS.find((a) => a.id === this.area()));
  protected readonly items = httpResource<RegistrySummary[]>(() => {
    const kind = this.buildArea()?.kind;
    return kind ? { url: '/api/registry', params: { kind } } : undefined;
  });
}
