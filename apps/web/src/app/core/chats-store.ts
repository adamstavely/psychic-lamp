import { HttpClient, httpResource } from '@angular/common/http';
import { computed, inject, Injectable } from '@angular/core';
import type { ChatPatch, ChatSummary } from '@donovan/contracts';
import { toast } from '@adamstavely/trenchcoat/toaster';
import { firstValueFrom } from 'rxjs';
import { Session } from './session';
import { groupChats } from './chat-groups';

/** The signed-in person's chats, shared by the rail and the Chats area. */
@Injectable({ providedIn: 'root' })
export class ChatsStore {
  readonly #http = inject(HttpClient);
  readonly #session = inject(Session);

  readonly list = httpResource<ChatSummary[]>(() => (this.#session.signedIn() ? '/api/chats' : undefined));
  readonly chats = computed(() => (this.list.hasValue() ? this.list.value() : []));
  readonly groups = computed(() => groupChats(this.chats(), new Date()));

  /** Takes a chat off the list (the list's Undo calls `restore`). */
  async archive(id: string): Promise<void> {
    const before = this.chats();
    this.list.set(before.filter((c) => c.id !== id));
    try {
      await firstValueFrom(this.#http.delete<void>(`/api/chats/${encodeURIComponent(id)}`));
    } catch {
      this.list.set(before);
      toast.error("Couldn't delete that chat", { description: 'Try again in a moment.' });
    }
  }

  async restore(id: string): Promise<void> {
    try {
      await firstValueFrom(this.#http.post<void>(`/api/chats/${encodeURIComponent(id)}/restore`, {}));
    } finally {
      this.list.reload();
    }
  }

  async update(id: string, patch: ChatPatch): Promise<void> {
    const before = this.chats();
    this.list.set(before.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    try {
      const saved = await firstValueFrom(this.#http.patch<ChatSummary>(`/api/chats/${encodeURIComponent(id)}`, patch));
      this.list.set(this.chats().map((c) => (c.id === id ? saved : c)));
    } catch {
      this.list.set(before);
      toast.error("Couldn't save that change to the chat", { description: 'Try again in a moment.' });
    }
  }
}
