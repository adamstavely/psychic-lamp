import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import type { RegistryItem, RegistryKind, RegistrySummary } from '@donovan/contracts';
import { linkTo } from './registry-links';
import { chatStart } from './use-in-chat';

type Agent = Extract<RegistryItem, { kind: 'agent' }>;

/** A part an agent is built from, linked to its page when the registry has it. */
interface Part {
  kind: 'Model' | 'Server' | 'Skill';
  name: string;
  link: string[] | null;
}

/** An agent: what it does, how much it does on its own, and the model, servers and skills it's built from. */
@Component({
  selector: 'dn-agent-detail',
  imports: [RouterLink, Button],
  templateUrl: './agent-detail.html',
  styleUrl: './detail.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentDetail {
  readonly item = input.required<Agent>();
  readonly #router = inject(Router);

  /** The registry, to link each part by name to its page. */
  readonly #registry = httpResource<RegistrySummary[]>(() => '/api/registry');

  protected readonly parts = computed<Part[]>(() => {
    const d = this.item().details;
    const all = this.#registry.hasValue() ? this.#registry.value() : [];
    const link = (kind: RegistryKind, name: string) => linkTo(all, kind, name);
    return [
      { kind: 'Model', name: d.model, link: link('model', d.model) },
      ...d.servers.map((name): Part => ({ kind: 'Server', name, link: link('server', name) })),
      ...d.skills.map((name): Part => ({ kind: 'Skill', name, link: link('skill', name) })),
    ];
  });

  protected runInChat(): void {
    void this.#router.navigate(['/chats/new'], {
      queryParams: chatStart(this.item(), this.item().details.model),
    });
  }
}
