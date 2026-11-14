import type { Brief } from '@donovan/contracts';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { DB, type Db } from '../db/db.module.js';
import { briefState } from '../db/schema.js';
import { briefFixture } from './brief.fixture.js';

type StateKind = (typeof briefState.$inferInsert)['kind'];

@Injectable()
export class BriefService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** The canned brief, with this person's done, read and seen marks applied. */
  async brief(userId: string, timeZone: string, now = new Date()): Promise<Brief> {
    const content = briefFixture(now, timeZone);
    const rows = await this.db.select().from(briefState).where(eq(briefState.userId, userId));
    const has = (kind: StateKind) => new Set(rows.filter((r) => r.kind === kind).map((r) => r.key));
    const done = has('need_done');
    const read = has('memo_read');
    return {
      ...content,
      needs: content.needs.map((n) => ({ ...n, done: done.has(n.id) })),
      memos: content.memos.map((m) => ({ ...m, read: read.has(m.id) })),
      seenUpdates: [...has('update_seen')],
    };
  }

  async setNeedDone(userId: string, needId: string, done: boolean): Promise<void> {
    this.assertKnown('need', [needId], (c) => c.needs.map((n) => n.id));
    if (done) await this.mark(userId, 'need_done', [needId]);
    else
      await this.db
        .delete(briefState)
        .where(and(eq(briefState.userId, userId), eq(briefState.kind, 'need_done'), eq(briefState.key, needId)));
  }

  async markMemosRead(userId: string, ids: string[]): Promise<void> {
    this.assertKnown('memo', ids, (c) => c.memos.map((m) => m.id));
    await this.mark(userId, 'memo_read', ids);
  }

  async markUpdatesSeen(userId: string, ids: string[]): Promise<void> {
    this.assertKnown('update', ids, (c) => c.accounts.flatMap((a) => a.updates.map((u) => u.id)));
    await this.mark(userId, 'update_seen', ids);
  }

  async markMemoUnread(userId: string, id: string): Promise<void> {
    this.assertKnown('memo', [id], (c) => c.memos.map((m) => m.id));
    await this.db
      .delete(briefState)
      .where(and(eq(briefState.userId, userId), eq(briefState.kind, 'memo_read'), inArray(briefState.key, [id])));
  }

  private async mark(userId: string, kind: StateKind, keys: string[]): Promise<void> {
    await this.db
      .insert(briefState)
      .values(keys.map((key) => ({ userId, kind, key })))
      .onConflictDoNothing();
  }

  private assertKnown(what: string, ids: string[], known: (c: ReturnType<typeof briefFixture>) => string[]): void {
    const all = new Set(known(briefFixture(new Date(), 'UTC')));
    const missing = ids.find((id) => !all.has(id));
    if (missing) throw new NotFoundException(`No ${what} "${missing}" in your brief`);
  }
}
