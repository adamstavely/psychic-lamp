import { HttpClient, httpResource } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import type {
  AssistantMessage,
  Block,
  Chat,
  Message,
  ModelChoice,
  StreamEvent,
  ToolDecision,
  ToolDecisionResult,
  Vote,
} from '@donovan/contracts';
import { toast } from '@adamstavely/trenchcoat/toaster';
import { firstValueFrom, lastValueFrom, tap } from 'rxjs';
import { ChatsStore } from '../../core/chats-store';
import { streamMessage } from './answer-stream';

/** One open chat: its turns, the answer being written, and the person's decisions and votes. */
@Injectable()
export class ThreadStore {
  readonly #http = inject(HttpClient);
  readonly #chats = inject(ChatsStore);

  readonly chatId = signal<string>('');
  readonly chat = httpResource<Chat>(() =>
    this.chatId() ? `/api/chats/${encodeURIComponent(this.chatId())}` : undefined,
  );

  /** Turns added since the chat loaded (sent, streamed, decided), laid over the loaded ones. */
  readonly #local = signal<Message[]>([]);
  readonly streaming = signal(false);
  /** What a screen reader hears about the answer in progress. */
  readonly status = signal('');

  readonly messages = computed<Message[]>(() => {
    const loaded = this.chat.hasValue() ? this.chat.value().messages : [];
    const local = this.#local();
    const replaced = new Map(local.map((m) => [m.id, m]));
    return [...loaded.map((m) => replaced.get(m.id) ?? m), ...local.filter((m) => !loaded.some((l) => l.id === m.id))];
  });

  open(chatId: string): void {
    if (chatId === this.chatId()) return;
    this.#local.set([]);
    this.chatId.set(chatId);
  }

  async send(text: string, model: ModelChoice): Promise<void> {
    this.streaming.set(true);
    this.status.set('Donovan is answering…');
    let answer: AssistantMessage | null = null;
    try {
      await lastValueFrom(
        streamMessage(this.#http, this.chatId(), { text, model }).pipe(tap((e) => (answer = this.apply(e, answer)))),
        { defaultValue: null },
      );
      this.status.set('Donovan answered.');
      this.#chats.list.reload();
    } catch {
      this.status.set('');
      toast.error("Donovan couldn't answer that", {
        description: 'Your message may not have been saved. Try sending it again.',
      });
      throw new Error('send failed');
    } finally {
      this.streaming.set(false);
    }
  }

  async decide(toolId: string, decision: ToolDecision): Promise<void> {
    const result = await firstValueFrom(
      this.#http.post<ToolDecisionResult>(
        `/api/chats/${encodeURIComponent(this.chatId())}/tools/${encodeURIComponent(toolId)}/decision`,
        decision,
      ),
    );
    this.upsert(result.updated);
    this.upsert(result.reply);
    this.status.set(
      decision.decision === 'approve' ? 'Approved. Donovan ran the tool.' : "Denied. The tool didn't run.",
    );
  }

  async vote(message: AssistantMessage, body: Vote): Promise<void> {
    const before = message;
    this.upsert({ ...message, vote: body.vote });
    try {
      await firstValueFrom(
        this.#http.put<void>(`/api/chats/${encodeURIComponent(this.chatId())}/messages/${message.id}/vote`, body),
      );
    } catch {
      this.upsert(before);
      toast.error("Couldn't save your feedback", { description: 'Try again in a moment.' });
    }
  }

  /** Folds one stream event into the thread; returns the answer as it now stands. */
  private apply(e: StreamEvent, answer: AssistantMessage | null): AssistantMessage | null {
    switch (e.type) {
      case 'user':
        this.upsert(e.message);
        return answer;
      case 'start': {
        const started: AssistantMessage = {
          id: e.id,
          role: 'assistant',
          routing: e.routing,
          blocks: [],
          durationMs: 0,
          vote: null,
          at: e.at,
        };
        this.upsert(started);
        return started;
      }
      case 'block':
        return this.edit(answer, (blocks) => Object.assign([...blocks], { [e.index]: e.block }));
      case 'delta':
        return this.edit(answer, (blocks) =>
          blocks.map((b, i): Block => (i === e.index && b.type === 'text' ? { ...b, text: b.text + e.text } : b)),
        );
      case 'done':
        this.upsert(e.message);
        return e.message;
      case 'error':
        throw new Error(e.message);
    }
  }

  private edit(answer: AssistantMessage | null, change: (blocks: Block[]) => Block[]): AssistantMessage | null {
    if (!answer) return null;
    const next = { ...answer, blocks: change(answer.blocks) };
    this.upsert(next);
    return next;
  }

  private upsert(m: Message): void {
    this.#local.update((list) =>
      list.some((x) => x.id === m.id) ? list.map((x) => (x.id === m.id ? m : x)) : [...list, m],
    );
  }
}
