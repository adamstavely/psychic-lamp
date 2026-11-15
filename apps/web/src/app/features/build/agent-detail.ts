import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import type { RegistryItem, RegistrySummary } from '@donovan/contracts';
import { linked, linkTo } from './registry-links';
import { chatStart } from './use-in-chat';

type Agent = Extract<RegistryItem, { kind: 'agent' }>;

/** A part an agent is built from, linked to its page when the registry has it. */
interface Part {
  kind: 'Model' | 'Server' | 'Skill';
  /** The server's or skill's id; the model is named by the chat model it runs on. */
  id?: string;
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

  /** The registry, to link each part to its page. */
  readonly #registry = httpResource<RegistrySummary[]>(() => '/api/registry');

  protected readonly parts = computed<Part[]>(() => {
    const d = this.item().details;
    const all = this.#registry.hasValue() ? this.#registry.value() : [];
    return [
      { kind: 'Model', name: d.model, link: linkTo(all, 'model', d.model) },
      ...d.servers.map((r): Part => ({ kind: 'Server', ...linked(all, 'server', r) })),
      ...d.skills.map((r): Part => ({ kind: 'Skill', ...linked(all, 'skill', r) })),
    ];
  });

  protected runInChat(): void {
    void this.#router.navigate(['/chats/new'], {
      queryParams: chatStart(this.item(), this.item().details.model),
    });
  }
}
