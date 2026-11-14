import type { Notification, NotificationsRead } from '@donovan/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { BriefService } from '../brief/brief.service.js';
import { ChatsService } from '../chats/chats.service.js';
import { DB, type Db } from '../db/db.module.js';
import { chats, messages, notificationState } from '../db/schema.js';

const MEMO = 'memo:';

/**
 * The bell's feed, made from what's happening in the person's own data: write tools waiting for their approval in their
 * chats, the Brief's memos (read marks shared with the Brief) and account updates.
 */
@Injectable()
export class NotificationsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly briefs: BriefService,
    private readonly chatsService: ChatsService,
  ) {}

  async list(userId: string, timeZone = 'UTC'): Promise<Notification[]> {
    await this.chatsService.list(userId); // seeds a first visit
    const [brief, states, waiting] = await Promise.all([
      this.briefs.brief(userId, timeZone),
      this.db.select().from(notificationState).where(eq(notificationState.userId, userId)),
      this.waitingApprovals(userId),
    ]);
    const state = new Map(states.map((s) => [s.key, s]));
    const read = (key: string) => !!state.get(key)?.readAt;

    const items: Notification[] = [
      ...waiting.map((w) => ({ ...w, read: read(w.id) })),
      ...brief.memos.map((m) => ({
        id: `${MEMO}${m.id}`,
        category: 'memos' as const,
        title: m.subject,
        actor: m.from,
        body: m.preview,
        context: m.project,
        time: m.at,
        read: m.read,
        href: '/brief',
      })),
      ...brief.accounts.flatMap((a) =>
        a.updates.map((u) => ({
          id: `update:${u.id}`,
          category: 'updates' as const,
          title: u.text,
          actor: a.name,
          body: null,
          context: a.sub,
          time: u.at,
          read: read(`update:${u.id}`),
          href: a.link.href,
        })),
      ),
    ];
    return items.filter((n) => !state.get(n.id)?.dismissedAt).sort((a, b) => b.time.localeCompare(a.time));
  }

  async markRead(userId: string, body: NotificationsRead): Promise<void> {
    const memos = body.ids.filter((id) => id.startsWith(MEMO)).map((id) => id.slice(MEMO.length));
    const others = body.ids.filter((id) => !id.startsWith(MEMO));
    if (memos.length) {
      if (body.read) await this.briefs.markMemosRead(userId, memos);
      else for (const m of memos) await this.briefs.markMemoUnread(userId, m);
    }
    if (others.length) {
      const readAt = body.read ? new Date() : null;
      await this.db
        .insert(notificationState)
        .values(others.map((key) => ({ userId, key, readAt })))
        .onConflictDoUpdate({ target: [notificationState.userId, notificationState.key], set: { readAt } });
    }
  }

  async dismiss(userId: string, id: string): Promise<void> {
    await this.db
      .insert(notificationState)
      .values({ userId, key: id, dismissedAt: new Date(), readAt: new Date() })
      .onConflictDoUpdate({
        target: [notificationState.userId, notificationState.key],
        set: { dismissedAt: new Date() },
      });
  }

  /** Write tools waiting in the person's chats, newest first. */
  private async waitingApprovals(userId: string): Promise<Omit<Notification, 'read'>[]> {
    const live = await this.db
      .select({ id: chats.id, title: chats.title })
      .from(chats)
      .where(and(eq(chats.ownerId, userId), isNull(chats.archivedAt)));
    if (live.length === 0) return [];
    const rows = await this.db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.ownerId, userId),
          eq(messages.role, 'assistant'),
          inArray(
            messages.chatId,
            live.map((c) => c.id),
          ),
        ),
      );
    const title = new Map(live.map((c) => [c.id, c.title]));
    return rows.flatMap((r) =>
      'blocks' in r.body
        ? r.body.blocks.flatMap((b) =>
            b.type === 'tool' && b.write && b.status === 'pending'
              ? [
                  {
                    id: `approval:${r.chatId}:${b.id}`,
                    category: 'approvals' as const,
                    title: `${b.name} is waiting for your approval`,
                    actor: 'Donovan',
                    body: b.summary,
                    context: title.get(r.chatId) ?? null,
                    time: r.createdAt.toISOString(),
                    href: `/chats/${r.chatId}`,
                  },
                ]
              : [],
          )
        : [],
    );
  }
}
