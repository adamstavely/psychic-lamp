import { HttpClient, httpResource } from '@angular/common/http';
import { computed, inject, Injectable } from '@angular/core';
import type { Notification } from '@donovan/contracts';
import { firstValueFrom } from 'rxjs';
import { Session } from './session';

/** The bell's feed. Marks show at once; the feed reloads if saving one fails. */
@Injectable({ providedIn: 'root' })
export class NotificationsStore {
  readonly #http = inject(HttpClient);
  readonly #session = inject(Session);
  readonly #tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  readonly feed = httpResource<Notification[]>(() =>
    this.#session.signedIn() ? { url: '/api/notifications', params: { tz: this.#tz } } : undefined,
  );
  readonly items = computed(() => (this.feed.hasValue() ? this.feed.value() : []));
  readonly unread = computed(() => this.items().filter((n) => !n.read).length);

  async markRead(ids: string[], read = true): Promise<void> {
    if (ids.length === 0) return;
    const set = new Set(ids);
    this.feed.set(this.items().map((n) => (set.has(n.id) ? { ...n, read } : n)));
    await this.save(() => this.#http.post<void>('/api/notifications/read', { ids, read }));
  }

  async dismiss(id: string): Promise<void> {
    this.feed.set(this.items().filter((n) => n.id !== id));
    await this.save(() => this.#http.post<void>('/api/notifications/dismiss', { id }));
  }

  private async save(call: () => ReturnType<HttpClient['post']>): Promise<void> {
    try {
      await firstValueFrom(call());
    } catch {
      this.feed.reload();
    }
  }
}
