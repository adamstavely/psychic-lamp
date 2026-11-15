import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { CodeBlock } from '@adamstavely/trenchcoat/angular/code-block';
import { SegmentedControl } from '@adamstavely/trenchcoat/angular/segmented-control';
import type { SegmentOption } from '@adamstavely/trenchcoat/segmented-control';
import type { RegistryItem } from '@donovan/contracts';
import { chatStart } from './use-in-chat';

type Skill = Extract<RegistryItem, { kind: 'skill' }>;
type Tab = 'skill' | 'tests';

/** A skill, read-only: its SKILL.md and how it does on its tests. Editing skills is slice 3's Skill Builder. */
@Component({
  selector: 'dn-skill-detail',
  imports: [Button, CodeBlock, SegmentedControl],
  templateUrl: './skill-detail.html',
  styleUrl: './detail.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SkillDetail {
  readonly item = input.required<Skill>();
  readonly #router = inject(Router);

  protected readonly tab = signal<Tab>('skill');
  protected readonly passed = computed(() => this.item().details.tests.filter((t) => t.result === 'pass').length);
  protected readonly tabs = computed<SegmentOption[]>(() => [
    { value: 'skill', label: 'SKILL.md', controls: 'skill-panel' },
    { value: 'tests', label: `Tests · ${this.item().details.tests.length}`, controls: 'skill-panel' },
  ]);
  protected pick(event: CustomEvent<{ value: unknown }>): void {
    this.tab.set(event.detail.value as Tab);
  }

  /** The SKILL.md an agent reads: its name and when to use it, then the principles it follows. */
  protected readonly skillMd = computed(() => {
    const s = this.item();
    const principles = s.details.principles.map((p) => `## ${p.title}\n\n${p.text}`).join('\n\n');
    return `---\nname: ${s.slug.split('/').pop()}\ndescription: ${s.summary}\n---\n\n# ${s.name}\n\n${principles}\n`;
  });

  protected useInChat(): void {
    void this.#router.navigate(['/chats/new'], { queryParams: chatStart(this.item()) });
  }
}
