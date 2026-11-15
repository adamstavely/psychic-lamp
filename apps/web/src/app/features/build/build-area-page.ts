import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import type { RegistryScope } from '@donovan/contracts';
import { BUILD_AREAS } from '../../shell/areas';
import { Catalog, type CatalogView } from './catalog';
import { GovernancePage } from './governance-page';
import { InsightsPage } from './insights-page';

/** A Build area: the catalog for a registry area, or Governance, or Insights. */
@Component({
  selector: 'dn-build-area-page',
  imports: [RouterLink, Catalog, GovernancePage, InsightsPage],
  template: `
    <section class="dn-build-page">
      @if (buildArea(); as a) {
        @if (a.kind) {
          <dn-catalog [area]="a" [scope]="scopeValue()" [view]="viewValue()" [task]="task() ?? null" />
        } @else if (a.id === 'governance') {
          <dn-governance-page [tab]="tab()" />
        } @else {
          <dn-insights-page />
        }
      } @else {
        <h1>Page not found</h1>
        <p>There's no Build area called that. <a routerLink="/build/skills">Go to Skills</a>.</p>
      }
    </section>
  `,
  styles: `
    h1 {
      display: flex;
      align-items: center;
      gap: var(--tc-space-2);
      margin: 0 0 var(--tc-space-2);
      font-size: var(--tc-font-size-2xl);
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
  /** Governance's tab, from the URL. */
  readonly tab = input<string>();

  protected readonly buildArea = computed(() => BUILD_AREAS.find((a) => a.id === this.area()));
  protected readonly scopeValue = computed<RegistryScope>(() => {
    const s = this.scope();
    return s === 'mine' || s === 'all' ? s : 'team';
  });
  protected readonly viewValue = computed<CatalogView>(() => (this.view() === 'list' ? 'list' : 'cards'));
}
