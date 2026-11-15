import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { CodeBlock } from '@adamstavely/trenchcoat/angular/code-block';
import type { RegistryItem } from '@donovan/contracts';
import { chatStart } from './use-in-chat';

type Prompt = Extract<RegistryItem, { kind: 'prompt' }>;

/** A prompt, read-only: the published version, its variables and tests, and every version before and since. */
@Component({
  selector: 'dn-prompt-detail',
  imports: [Button, CodeBlock],
  templateUrl: './prompt-detail.html',
  styleUrl: './detail.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PromptDetail {
  readonly item = input.required<Prompt>();
  readonly #router = inject(Router);

  /** The published version (`published` counts from 1). */
  protected readonly current = computed(() => {
    const d = this.item().details;
    return d.versions[d.published - 1] ?? d.versions.at(-1)!;
  });
  protected readonly output = computed(() => this.item().details.outputs[this.current().version] ?? null);
  protected readonly variables = computed(() => Object.entries(this.item().details.variables));
  /** Newest first. */
  protected readonly history = computed(() => [...this.item().details.versions].reverse());

  protected useInChat(): void {
    void this.#router.navigate(['/chats/new'], {
      queryParams: chatStart(this.item(), this.item().details.model),
    });
  }
}
