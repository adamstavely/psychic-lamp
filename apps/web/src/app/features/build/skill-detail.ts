import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { CodeBlock } from '@adamstavely/trenchcoat/angular/code-block';
import type { RegistryItem } from '@donovan/contracts';
import { chatStart } from './use-in-chat';

type Skill = Extract<RegistryItem, { kind: 'skill' }>;

/** A skill, read-only and on one page: how it does on its tests, then its SKILL.md (its instructions). Editing skills is slice 3's
 *  Skill Builder. */
@Component({
  selector: 'dn-skill-detail',
  imports: [Button, CodeBlock],
  templateUrl: './skill-detail.html',
  styleUrl: './detail.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SkillDetail {
  readonly item = input.required<Skill>();
  readonly #router = inject(Router);

  protected readonly passed = computed(() => this.item().details.tests.filter((t) => t.result === 'pass').length);

  /** The SKILL.md an agent reads: its name and when to use it, then the principles it follows. */
  protected readonly skillMd = computed(() => {
    const s = this.item();
    if (s.details.skillMd) return s.details.skillMd;
    const principles = s.details.principles.map((p) => `## ${p.title}\n\n${p.text}`).join('\n\n');
    return `---\nname: ${s.slug.split('/').pop()}\ndescription: ${s.summary}\n---\n\n# ${s.name}\n\n${principles}\n`;
  });

  protected useInChat(): void {
    void this.#router.navigate(['/chats/new'], { queryParams: chatStart(this.item()) });
  }
}
