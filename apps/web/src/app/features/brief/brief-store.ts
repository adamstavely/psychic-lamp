import { HttpClient, httpResource } from '@angular/common/http';
import { computed, inject, Injectable } from '@angular/core';
import type { Brief, BriefMemo, BriefNeed } from '@donovan/contracts';
import { toast } from '@adamstavely/trenchcoat/toaster';
import { firstValueFrom } from 'rxjs';

/** The Daily Brief and the marks the reader makes on it. Marks show at once and are undone if saving fails. */
@Injectable()
export class BriefStore {
  readonly #http = inject(HttpClient);
  readonly #tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  readonly brief = httpResource<Brief>(() => ({ url: '/api/brief', params: { tz: this.#tz } }));

  readonly openNeeds = computed(() => (this.brief.hasValue() ? this.brief.value().needs.filter((n) => !n.done) : []));
  readonly unreadMemos = computed(() => (this.brief.hasValue() ? this.brief.value().memos.filter((m) => !m.read) : []));
  readonly newResults = computed(() =>
    this.brief.hasValue() ? this.brief.value().searches.reduce((sum, s) => sum + s.newCount, 0) : 0,
  );

  setDone(need: BriefNeed, done: boolean): Promise<void> {
    return this.change(
      (b) => ({ ...b, needs: b.needs.map((n) => (n.id === need.id ? { ...n, done } : n)) }),
      this.#http.put<void>(`/api/brief/needs/${encodeURIComponent(need.id)}/done`, { done }),
    );
  }

  markRead(memos: BriefMemo[]): Promise<void> {
    const ids = new Set(memos.map((m) => m.id));
    if (ids.size === 0) return Promise.resolve();
    return this.change(
      (b) => ({ ...b, memos: b.memos.map((m) => (ids.has(m.id) ? { ...m, read: true } : m)) }),
      this.#http.post<void>('/api/brief/memos/read', { ids: [...ids] }),
    );
  }

  markSeen(ids: string[]): Promise<void> {
    if (ids.length === 0) return Promise.resolve();
    return this.change(
      (b) => ({ ...b, seenUpdates: [...new Set([...b.seenUpdates, ...ids])] }),
      this.#http.post<void>('/api/brief/updates/seen', { ids }),
    );
  }

  private async change(apply: (b: Brief) => Brief, save: ReturnType<HttpClient['post']>): Promise<void> {
    if (!this.brief.hasValue()) return;
    const before = this.brief.value();
    this.brief.set(apply(before));
    try {
      await firstValueFrom(save);
    } catch {
      this.brief.set(before);
      toast.error("Couldn't save that", { description: 'Your brief is back as it was. Try again in a moment.' });
    }
  }
}
