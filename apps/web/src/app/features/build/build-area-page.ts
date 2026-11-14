import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import type { RegistryScope } from '@donovan/contracts';
import { IconDirective } from '../../core/icon.directive';
import { BUILD_AREAS } from '../../shell/areas';
import { Catalog, type CatalogView } from './catalog';

/** A Build area: the catalog for a registry area. The Insights and Governance pages arrive in later steps of slice 2. */
@Component({
  selector: 'dn-build-area-page',
  imports: [RouterLink, IconDirective, Catalog],
  template: `
    <section class="page">
      @if (buildArea(); as a) {
        @if (a.kind) {
          <dn-catalog [area]="a" [scope]="scopeValue()" [view]="viewValue()" [task]="task() ?? null" />
        } @else {
          <h1><span [dnIcon]="a.icon"></span>{{ a.label }}</h1>
          <p class="blurb">{{ a.description }}</p>
          <p class="soon">This page arrives later in Build mode's first release.</p>
        }
      } @else {
        <h1>Page not found</h1>
        <p>There's no Build area called that. <a routerLink="/build/skills">Go to Skills</a>.</p>
      }
    </section>
  `,
  styles: `
    .page {
      max-width: 75rem;
      padding: var(--tc-space-8) var(--tc-space-10, 2.5rem);
    }
    h1 {
      display: flex;
      align-items: center;
      gap: var(--tc-space-2);
      margin: 0 0 var(--tc-space-2);
      font-size: var(--tc-font-size-2xl);
    }
    .blurb,
    .soon {
      color: var(--tc-text-secondary);
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

  /** From the route and its query: which area, and how its catalog is shown. */
  readonly area = input<string>('');
  readonly scope = input<string>();
  readonly view = input<string>();
  readonly task = input<string>();

  protected readonly buildArea = computed(() => BUILD_AREAS.find((a) => a.id === this.area()));
  protected readonly scopeValue = computed<RegistryScope>(() => {
    const s = this.scope();
    return s === 'mine' || s === 'team' ? s : 'all';
  });
  protected readonly viewValue = computed<CatalogView>(() => (this.view() === 'list' ? 'list' : 'cards'));
}
