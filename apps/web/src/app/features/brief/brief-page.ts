import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { Checkbox } from '@adamstavely/trenchcoat/angular/checkbox';
import { Stories } from '@adamstavely/trenchcoat/angular/stories';
import type { StoryActionEvent, StoryEntry, StorySeenChangeEvent } from '@adamstavely/trenchcoat/stories';
import type { Brief, BriefAccount, BriefMemo, BriefNeed } from '@donovan/contracts';
import { IconDirective } from '../../core/icon.directive';
import { Session } from '../../core/session';
import { BriefStore } from './brief-store';
import { clockTime, greeting, initials, longDate, needsLine, relativeDay, sinceLine } from './format';

const NEED_TAG: Record<BriefNeed['kind'], string> = {
  approval: 'Approval',
  workflow: 'Workflow',
  model: 'Model',
  access: 'Access',
};

@Component({
  selector: 'dn-brief-page',
  imports: [FormsModule, RouterLink, Button, Checkbox, Stories, IconDirective],
  providers: [BriefStore],
  templateUrl: './brief-page.html',
  styleUrl: './brief-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class BriefPage {
  protected readonly store = inject(BriefStore);
  readonly #session = inject(Session);
  readonly #router = inject(Router);

  protected readonly now = new Date();
  protected readonly needTag = NEED_TAG;
  protected readonly initials = initials;
  protected readonly clockTime = clockTime;
  protected readonly date = longDate(this.now);
  protected question = '';

  protected readonly heading = computed(() => {
    const name = this.#session.me.hasValue() ? `, ${this.#session.me.value().firstName}` : '';
    return `${greeting(this.now)}${name}.`;
  });
  protected readonly askPlaceholder = computed(() => {
    const key = this.store.brief.hasValue() ? this.store.brief.value().meetings.find((m) => m.important) : undefined;
    return key
      ? `Ask about your brief, e.g. what should I prep for the ${clockTime(key.start)} meeting?`
      : 'Ask about your brief';
  });
  protected readonly needsLine = computed(() => needsLine(this.store.openNeeds().length));

  protected since(brief: Brief): string {
    return sinceLine(brief.since, this.now);
  }

  protected when(iso: string): string {
    return relativeDay(iso, this.now);
  }

  protected readonly storyEntries = computed<StoryEntry[]>(() =>
    this.store.brief.hasValue() ? this.store.brief.value().accounts.map(toStory) : [],
  );
  protected readonly storySeen = computed<Record<string, boolean>>(() =>
    this.store.brief.hasValue() ? Object.fromEntries(this.store.brief.value().seenUpdates.map((id) => [id, true])) : {},
  );

  protected onSeen(event: CustomEvent<StorySeenChangeEvent>): void {
    // Link tiles aren't updates the API tracks; only real updates are marked seen.
    const ids = event.detail.updates.map((u) => u.id).filter((id) => !id.endsWith(LINK_SUFFIX));
    void this.store.markSeen(ids);
  }

  protected onStoryAction(event: CustomEvent<StoryActionEvent>): void {
    const href = 'href' in event.detail.update ? event.detail.update.href : undefined;
    if (!href) return;
    event.preventDefault();
    void this.#router.navigateByUrl(href);
  }

  protected toggleNeed(need: BriefNeed, event: CustomEvent<{ value: boolean }>): void {
    event.preventDefault();
    void this.store.setDone(need, event.detail.value);
  }

  protected markAllRead(memos: BriefMemo[]): void {
    void this.store.markRead(memos.filter((m) => !m.read));
  }

  /** Replying in the person's own mail app: a new message with the subject filled in. */
  protected mailto(memo: BriefMemo): string {
    return `mailto:?subject=${encodeURIComponent(`Re: ${memo.subject}`)}`;
  }

  protected replyPrompt(memo: BriefMemo): string {
    return `Draft a reply to ${memo.from} about "${memo.subject}".`;
  }

  /** The summary chips move focus to their section, so keyboard and screen-reader users land there too. */
  protected focusSection(id: string): void {
    const heading = document.getElementById(id);
    heading?.scrollIntoView({ block: 'start' });
    heading?.focus({ preventScroll: true });
  }

  protected ask(): void {
    const q = this.question.trim();
    if (!q) return;
    void this.#router.navigate(['/chats/new'], { queryParams: { q } });
  }
}

const LINK_SUFFIX = ':link';

function toStory(a: BriefAccount): StoryEntry {
  return {
    id: a.id,
    name: a.name,
    kind: a.kind === 'person' ? 'person' : 'account',
    summary: a.sub,
    updates: [
      ...a.updates.map((u) => ({ id: u.id, kind: 'note' as const, title: clockTime(u.at), text: u.text })),
      ...(a.link.href
        ? [
            {
              id: `${a.id}${LINK_SUFFIX}`,
              kind: 'link' as const,
              title: a.name,
              label: a.link.label,
              href: a.link.href,
            },
          ]
        : []),
    ],
  };
}
