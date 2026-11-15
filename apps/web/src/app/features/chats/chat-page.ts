import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
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
import { ArtifactPane } from '../artifacts/artifact-pane';
import { BlockView } from './block-view';
import { COMPOSER_MODELS, FEEDBACK_REASONS, PENDING_SEND, type PendingSend } from './composer';
import { ComposerFiles } from './composer-files';
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
  imports: [
    ArtifactPane,
    BlockView,
    ChatComposer,
    MessageActions,
    ReflectionGate,
    RouterLink,
    SessionPanel,
    ThreadHeader,
  ],
  providers: [ThreadStore, ComposerFiles],
  templateUrl: './chat-page.html',
  styleUrl: './chat-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ChatPage {
  /** From the route. */
  readonly chatId = input.required<string>();
  /** From the URL (?artifact=…): an artifact open beside the chat. */
  readonly artifact = input<string>();
  readonly #store = inject(ChatsStore);
  readonly #title = inject(Title);
  readonly #router = inject(Router);

  protected readonly thread = inject(ThreadStore);
  protected readonly chat = this.thread.chat;
  protected readonly models = COMPOSER_MODELS;
  protected readonly dictate = dictate;
  protected readonly files = inject(ComposerFiles);
  /** The model the composer is on: kept from one message to the next, and used to regenerate. */
  protected readonly model = signal<ModelChoice>('auto');
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
      untracked(() => {
        this.model.set(pending.model);
        void this.thread.send(pending.text, pending.model, pending.attachments ?? []).catch(() => undefined);
      });
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
  /** The side pane: an open artifact takes it; otherwise the session panel, when open. */
  protected readonly pane = computed<'artifact' | 'session' | null>(() =>
    this.artifact() ? 'artifact' : this.panelOpen() ? 'session' : null,
  );

  protected closeArtifact(): void {
    void this.#router.navigate([], { queryParams: { artifact: null }, queryParamsHandling: 'merge' });
  }

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

  /** The claim the person said they'd verify, by its words (ids mean nothing to a reader). */
  protected readonly verifying = computed(() => {
    const point = this.chat.hasValue() ? this.chat.value().checkpoints[0] : undefined;
    if (!point) return '';
    return allClaims(this.thread.messages()).find((c) => c.id === point.claimId)?.text ?? point.claimId;
  });

  protected onCheckpoint(event: CustomEvent<ReflectionGateSubmission>): void {
    const { claim, method } = event.detail.value;
    if (!claim || !method) return;
    void this.thread.addCheckpoint({ claimId: claim, method });
  }

  protected readonly send = async (message: string, details: ChatSendDetails): Promise<void> => {
    const model = details.model as ModelChoice;
    this.model.set(model);
    await this.thread.send(message, model, this.files.ids());
    this.files.clear();
  };

  protected onModel(event: CustomEvent<{ model: string }>): void {
    this.model.set(event.detail.model as ModelChoice);
  }

  protected readonly decide = (toolId: string, decision: ToolDecision): Promise<void> =>
    this.thread.decide(toolId, decision);

  /** Regenerate, per answer; kept so the bar's handler doesn't change on every check. */
  readonly #regenerators = new Map<string, () => Promise<void>>();
  protected regenerator(m: AssistantMessage): () => Promise<void> {
    let fn = this.#regenerators.get(m.id);
    if (!fn) {
      fn = () => {
        const current = this.thread.messages().find((x) => x.id === m.id);
        return this.thread.regenerate((current as AssistantMessage | undefined) ?? m, this.model());
      };
      this.#regenerators.set(m.id, fn);
    }
    return fn;
  }

  protected onVersion(m: AssistantMessage, event: CustomEvent<{ version: unknown }>): void {
    event.preventDefault();
    void this.thread.showVersion(m, Number(event.detail.version) + 1);
  }

  protected onFeedback(m: AssistantMessage, event: CustomEvent<{ feedback: unknown; reason?: unknown }>): void {
    const vote = event.detail.feedback === 'up' || event.detail.feedback === 'down' ? event.detail.feedback : null;
    const reason = typeof event.detail.reason === 'string' ? event.detail.reason : undefined;
    void this.thread.vote(m, { vote, ...(reason ? { reason } : {}) });
  }

  protected isAssistant(m: Message): m is AssistantMessage {
    return m.role === 'assistant';
  }
}
