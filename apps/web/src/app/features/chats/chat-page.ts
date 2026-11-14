import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { MessageActions } from '@adamstavely/trenchcoat/angular/message-actions';
import { ThreadHeader } from '@adamstavely/trenchcoat/angular/thread-header';
import type { AssistantMessage, Chat, Route } from '@donovan/contracts';
import { ChatsStore } from '../../core/chats-store';
import { BlockView } from './block-view';
import { workedLabel, plainText } from './messages';

const ROUTE_KIND: Record<Route['kind'], string> = {
  model: 'Model',
  skill: 'Skill',
  server: 'Server',
  dataset: 'Dataset',
  flow: 'Workflow',
};

@Component({
  selector: 'dn-chat-page',
  imports: [BlockView, MessageActions, ThreadHeader],
  templateUrl: './chat-page.html',
  styleUrl: './chat-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ChatPage {
  /** From the route. */
  readonly chatId = input.required<string>();
  readonly #store = inject(ChatsStore);
  readonly #title = inject(Title);

  protected readonly chat = httpResource<Chat>(() => `/api/chats/${encodeURIComponent(this.chatId())}`);
  protected readonly routeKind = ROUTE_KIND;
  protected readonly workedLabel = workedLabel;
  protected readonly plainText = plainText;

  /** The title the list shows, so a rename in the rail shows here at once. */
  protected readonly heading = computed(() => {
    const listed = this.#store.chats().find((c) => c.id === this.chatId());
    return listed?.title ?? (this.chat.hasValue() ? this.chat.value().title : '');
  });

  constructor() {
    effect(() => {
      const heading = this.heading();
      if (heading) this.#title.setTitle(`${heading} · Donovan`);
    });
  }

  protected rename(event: CustomEvent<{ title: unknown }>): void {
    void this.#store.update(this.chatId(), { title: String(event.detail.title) });
  }

  protected isAssistant(m: Chat['messages'][number]): m is AssistantMessage {
    return m.role === 'assistant';
  }
}
