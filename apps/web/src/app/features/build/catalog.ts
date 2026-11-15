import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { SegmentedControl } from '@adamstavely/trenchcoat/angular/segmented-control';
import type { SegmentOption, SegmentValueChange } from '@adamstavely/trenchcoat/segmented-control';
import type { RegistryKind, RegistryScope, RegistrySummary } from '@donovan/contracts';
import { IconDirective } from '../../core/icon.directive';
import { icon } from '../../core/icons';
import { Session } from '../../core/session';
import type { BuildArea } from '../../shell/areas';
import { chatStart } from './use-in-chat';

export type CatalogView = 'cards' | 'list';

const SCOPE_LABEL: Record<RegistryScope, string> = { mine: 'Mine', team: 'Team', all: 'All' };

/** The action a card leads with, by kind: using the item in a chat, or opening it to try. */
const PRIMARY: Record<RegistryKind, string> = {
  skill: 'Use in chat',
  server: 'Use in chat',
  agent: 'Run in chat',
  workflow: 'Open',
  model: 'Use in chat',
  dataset: 'Use in chat',
  space: 'Try it',
  collection: 'Open',
  prompt: 'Use in chat',
};

/**
 * One Build area's catalog: Mine, Team (the default: yours and your teams') or All, as cards or a list, each item with its state, sensitivity, figures, its
 * leading action and Open. Scope, view and (for models) task are in the address, so a view can be linked to.
 */
@Component({
  selector: 'dn-catalog',
  imports: [RouterLink, Button, SegmentedControl, IconDirective],
  templateUrl: './catalog.html',
  styleUrl: './catalog.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Catalog {
  readonly area = input.required<BuildArea>();
  readonly scope = input<RegistryScope>('team');
  readonly view = input<CatalogView>('cards');
  readonly task = input<string | null>(null);

  readonly #router = inject(Router);
  readonly #session = inject(Session);
  protected readonly governance = computed(() => this.#session.preferences().showGovernance);

  protected readonly items = httpResource<RegistrySummary[]>(() => ({
    url: '/api/registry',
    params: { kind: this.area().kind!, scope: this.scope() },
  }));

  /** The models' task filter: each task in the list, with how many have it. */
  protected readonly tasks = computed(() => {
    if (!this.items.hasValue()) return [];
    const n = new Map<string, number>();
    for (const i of this.items.value()) if (i.card.facet) n.set(i.card.facet, (n.get(i.card.facet) ?? 0) + 1);
    return [...n].map(([label, count]) => ({ label, count }));
  });

  protected readonly shown = computed(() => {
    const all = this.items.hasValue() ? this.items.value() : [];
    const task = this.task();
    return task ? all.filter((i) => i.card.facet === task) : all;
  });

  protected readonly scopes: SegmentOption[] = (['mine', 'team', 'all'] as const).map((s) => ({
    value: s,
    label: SCOPE_LABEL[s],
  }));
  protected readonly views: SegmentOption[] = [
    { value: 'cards', icon: icon('grid', 14), ariaLabel: 'Card view' },
    { value: 'list', icon: icon('list', 14), ariaLabel: 'List view' },
  ];
  protected readonly scopeLabel = computed(() => SCOPE_LABEL[this.scope()]);
  /** The area's items mid-sentence: "skills", "MCP servers". */
  protected readonly noun = computed(() =>
    this.area()
      .label.split(' ')
      .map((w) => (/^[A-Z]+$/.test(w) ? w : w.toLowerCase()))
      .join(' '),
  );
  /** What an empty catalog says, for the scope it's showing. */
  protected readonly emptyText = computed(() => {
    const made = this.area().kind === 'workflow' || this.area().kind === 'prompt' ? 'made' : 'registered';
    switch (this.scope()) {
      case 'mine':
        return `You haven't ${made} any ${this.noun()} yet.`;
      case 'team':
        return `Neither you nor your teams have any ${this.noun()} yet.`;
      default:
        return `There are no ${this.noun()} yet.`;
    }
  });

  protected primaryLabel(item: RegistrySummary): string {
    return PRIMARY[item.kind];
  }

  protected link(item: RegistrySummary): string[] {
    return [this.area().path, item.id];
  }

  protected onScope(event: CustomEvent<SegmentValueChange>): void {
    event.preventDefault();
    this.#query({ scope: event.detail.value === 'team' ? null : event.detail.value });
  }

  protected onView(event: CustomEvent<SegmentValueChange>): void {
    event.preventDefault();
    this.#query({ view: event.detail.value === 'cards' ? null : event.detail.value });
  }

  protected pickTask(task: string | null): void {
    this.#query({ task: this.task() === task ? null : task });
  }

  /**
   * The leading action. Using something in chat opens a new chat that names it (and picks the model, for a model the
   * composer offers); Try it opens a space with its sample input filled in, ready to run; the others open the item.
   */
  protected primary(item: RegistrySummary): void {
    const action = PRIMARY[item.kind];
    if (action === 'Try it') {
      void this.#router.navigate(this.link(item), { queryParams: { try: 'sample' } });
      return;
    }
    if (action === 'Open') {
      void this.#router.navigate(this.link(item));
      return;
    }
    void this.#router.navigate(['/chats/new'], { queryParams: chatStart(item) });
  }

  #query(params: Record<string, string | null>): void {
    void this.#router.navigate([], { queryParams: params, queryParamsHandling: 'merge', replaceUrl: true });
  }
}
