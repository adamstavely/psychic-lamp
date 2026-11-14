import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ChatComposer } from '@adamstavely/trenchcoat/angular/chat-composer';
import { ReflectionGate } from '@adamstavely/trenchcoat/angular/reflection-gate';
import { MessageActions } from '@adamstavely/trenchcoat/angular/message-actions';
import type { ChatSendDetails } from '@adamstavely/trenchcoat/chat-composer';
import type { ReflectionGateSubmission } from '@adamstavely/trenchcoat/reflection-gate';
import type { ThreadHeaderToggle } from '@adamstavely/trenchcoat/thread-header';
import { ThreadHeader } from '@adamstavely/trenchcoat/angular/thread-header';
import type { AssistantMessage, Message, ModelChoice, Route, ToolDecision } from '@donovan/contracts';
import { ChatsStore } from '../../core/chats-store';
import { dictate } from '../../core/dictation';
import { BlockView } from './block-view';
import { COMPOSER_MODELS, FEEDBACK_REASONS, PENDING_SEND, type PendingSend } from './composer';
import { allClaims, needsCheckpoint } from './session';
import { SessionPanel } from './session-panel';
import { ThreadStore } from './thread-store';
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
  imports: [BlockView, ChatComposer, MessageActions, ReflectionGate, SessionPanel, ThreadHeader],
  providers: [ThreadStore],
  templateUrl: './chat-page.html',
  styleUrl: './chat-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ChatPage {
  /** From the route. */
  readonly chatId = input.required<string>();
  readonly #store = inject(ChatsStore);
  readonly #title = inject(Title);

  protected readonly thread = inject(ThreadStore);
  protected readonly chat = this.thread.chat;
  protected readonly models = COMPOSER_MODELS;
  protected readonly dictate = dictate;
  protected readonly reasons = FEEDBACK_REASONS;
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
      const id = this.chatId();
      untracked(() => this.thread.open(id));
    });
    // A chat started from the home page arrives with its first message to send.
    effect(() => {
      if (!this.chat.hasValue()) return;
      const pending = history.state?.[PENDING_SEND] as PendingSend | undefined;
      if (!pending) return;
      history.replaceState({ ...history.state, [PENDING_SEND]: undefined }, '');
      untracked(() => void this.thread.send(pending.text, pending.model).catch(() => undefined));
    });
    effect(() => {
      const heading = this.heading();
      if (heading) this.#title.setTitle(`${heading} · Donovan`);
    });
  }

  protected rename(event: CustomEvent<{ title: unknown }>): void {
    void this.#store.update(this.chatId(), { title: String(event.detail.title) });
  }

  protected readonly toggles: ThreadHeaderToggle[] = [{ id: 'session', label: 'Session panel' }];
  /** Open for Calibrated chats, whose claims want reviewing; otherwise until the person opens it. */
  readonly #panelChoice = signal<boolean | null>(null);
  protected readonly panelOpen = computed(
    () => this.#panelChoice() ?? (this.chat.hasValue() ? this.chat.value().calibrated : false),
  );
  protected readonly panels = computed(() => (this.panelOpen() ? ['session'] : []));

  protected onPanels(event: CustomEvent<{ panels: unknown }>): void {
    event.preventDefault();
    this.#panelChoice.set(Array.isArray(event.detail.panels) && event.detail.panels.includes('session'));
  }

  protected readonly checkpointClaims = computed(() =>
    allClaims(this.thread.messages()).map((c) => ({ id: c.id, text: `${c.topic}: ${c.text}` })),
  );
  protected readonly askCheckpoint = computed(
    () =>
      this.chat.hasValue() &&
      needsCheckpoint(this.chat.value().calibrated, this.thread.messages(), this.chat.value().checkpoints.length),
  );

  protected onCheckpoint(event: CustomEvent<ReflectionGateSubmission>): void {
    const { claim, method } = event.detail.value;
    if (!claim || !method) return;
    void this.thread.addCheckpoint({ claimId: claim, method });
  }

  protected readonly send = (message: string, details: ChatSendDetails): Promise<void> =>
    this.thread.send(message, details.model as ModelChoice);

  protected readonly decide = (toolId: string, decision: ToolDecision): Promise<void> =>
    this.thread.decide(toolId, decision);

  protected onFeedback(m: AssistantMessage, event: CustomEvent<{ feedback: unknown; reason?: unknown }>): void {
    const vote = event.detail.feedback === 'up' || event.detail.feedback === 'down' ? event.detail.feedback : null;
    const reason = typeof event.detail.reason === 'string' ? event.detail.reason : undefined;
    void this.thread.vote(m, { vote, ...(reason ? { reason } : {}) });
  }

  protected isAssistant(m: Message): m is AssistantMessage {
    return m.role === 'assistant';
  }
}
