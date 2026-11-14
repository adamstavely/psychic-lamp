import { HttpClient, httpResource } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import type {
  AssistantMessage,
  Block,
  Chat,
  ClaimReview,
  Message,
  NewCheckpoint,
  ProvenanceManifest,
  ModelChoice,
  StreamEvent,
  ToolDecision,
  ToolDecisionResult,
  Vote,
} from '@donovan/contracts';
import { toast } from '@adamstavely/trenchcoat/toaster';
import { firstValueFrom, lastValueFrom, tap } from 'rxjs';
import { ChatsStore } from '../../core/chats-store';
import { streamMessage, streamPost } from './answer-stream';

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
    const reviews = this.#reviews();
    const merged = [
      ...loaded.map((m) => replaced.get(m.id) ?? m),
      ...local.filter((m) => !loaded.some((l) => l.id === m.id)),
    ];
    if (Object.keys(reviews).length === 0) return merged;
    return merged.map((m) =>
      m.role !== 'assistant'
        ? m
        : {
            ...m,
            blocks: m.blocks.map((b) =>
              b.type === 'claims'
                ? { ...b, items: b.items.map((c) => (c.id in reviews ? { ...c, review: reviews[c.id] ?? null } : c)) }
                : b,
            ),
          },
    );
  });

  open(chatId: string): void {
    if (chatId === this.chatId()) return;
    this.#local.set([]);
    this.#reviews.set({});
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

  /** Streams a new version of an answer into it; the version switcher moves to it. */
  async regenerate(message: AssistantMessage, model: ModelChoice = 'auto'): Promise<void> {
    this.streaming.set(true);
    this.status.set('Donovan is answering again…');
    let answer: AssistantMessage | null = null;
    try {
      await lastValueFrom(
        streamPost(this.#http, `/api/chats/${encodeURIComponent(this.chatId())}/messages/${message.id}/regenerate`, {
          model,
        }).pipe(tap((e) => (answer = this.apply(e, answer, message)))),
        { defaultValue: null },
      );
      this.status.set(`Version ${message.versions.length + 1} of the answer is ready.`);
    } catch {
      this.upsert(message);
      this.status.set('');
      throw new Error('regenerate failed');
    } finally {
      this.streaming.set(false);
    }
  }

  /** Shows another version of an answer (from 1), and remembers it. */
  async showVersion(message: AssistantMessage, version: number): Promise<void> {
    const v = message.versions[version - 1];
    if (!v) return;
    this.upsert({ ...message, ...v, version });
    this.status.set(`Showing version ${version} of ${message.versions.length}.`);
    try {
      await firstValueFrom(
        this.#http.put<void>(`/api/chats/${encodeURIComponent(this.chatId())}/messages/${message.id}/version`, {
          version,
        }),
      );
    } catch {
      // Still shown here; it just won't be the one shown next time.
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

  /** Claim verdicts made here, laid over the loaded ones until the chat reloads. */
  readonly #reviews = signal<Record<string, ClaimReview['review']>>({});
  readonly reviews = computed(() => this.#reviews());

  async reviewClaim(claimId: string, review: ClaimReview['review']): Promise<void> {
    const before = this.#reviews();
    this.#reviews.set({ ...before, [claimId]: review });
    try {
      await firstValueFrom(
        this.#http.put<void>(
          `/api/chats/${encodeURIComponent(this.chatId())}/claims/${encodeURIComponent(claimId)}/review`,
          {
            review,
          },
        ),
      );
      this.status.set(review ? `Claim ${review}.` : 'Verdict cleared.');
    } catch {
      this.#reviews.set(before);
      toast.error("Couldn't save your verdict", { description: 'Try again in a moment.' });
    }
  }

  async addCheckpoint(body: NewCheckpoint): Promise<void> {
    await firstValueFrom(this.#http.post<void>(`/api/chats/${encodeURIComponent(this.chatId())}/checkpoints`, body));
    this.chat.reload();
  }

  /** Downloads the chat's provenance record as a JSON file. */
  async exportProvenance(): Promise<void> {
    const manifest = await firstValueFrom(
      this.#http.get<ProvenanceManifest>(`/api/chats/${encodeURIComponent(this.chatId())}/export`),
    );
    const url = URL.createObjectURL(new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), {
      href: url,
      download: `donovan-${this.chatId()}-provenance.json`,
    });
    a.click();
    URL.revokeObjectURL(url);
    this.status.set('Provenance record downloaded.');
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

  /**
   * Folds one stream event into the thread; returns the answer as it now stands. `base`: the answer being regenerated,
   * whose earlier versions are kept while the new one streams in.
   */
  private apply(e: StreamEvent, answer: AssistantMessage | null, base?: AssistantMessage): AssistantMessage | null {
    switch (e.type) {
      case 'user':
        this.upsert(e.message);
        return answer;
      case 'start': {
        const fresh = { routing: e.routing, blocks: [], durationMs: 0 };
        const started: AssistantMessage = base
          ? { ...base, ...fresh, versions: [...base.versions, fresh], version: base.versions.length + 1, vote: null }
          : { id: e.id, role: 'assistant', ...fresh, versions: [fresh], version: 1, vote: null, at: e.at };
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
