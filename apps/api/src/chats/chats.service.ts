import type { Chat, ChatPatch, ChatSummary, Message } from '@donovan/contracts';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { DB, type Db } from '../db/db.module.js';
import { chats, messages } from '../db/schema.js';
import { SeedService } from '../seed/seed.service.js';

type ChatRow = typeof chats.$inferSelect;
type MessageRow = typeof messages.$inferSelect;

@Injectable()
export class ChatsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly seeds: SeedService,
  ) {}

  /** The person's chats, pinned first, then most recently active. */
  async list(userId: string): Promise<ChatSummary[]> {
    await this.seeds.ensureChats(userId);
    const rows = await this.db
      .select()
      .from(chats)
      .where(and(eq(chats.ownerId, userId), isNull(chats.archivedAt)))
      .orderBy(desc(chats.pinned), desc(chats.updatedAt));
    return rows.map(toSummary);
  }

  async get(userId: string, id: string): Promise<Chat> {
    await this.seeds.ensureChats(userId);
    const [row] = await this.db
      .select()
      .from(chats)
      .where(and(eq(chats.ownerId, userId), eq(chats.id, id), isNull(chats.archivedAt)));
    if (!row) throw new NotFoundException('No chat with that id');
    const turns = await this.db
      .select()
      .from(messages)
      .where(and(eq(messages.ownerId, userId), eq(messages.chatId, id)))
      .orderBy(asc(messages.seq));
    return { ...toSummary(row), intent: row.intent ?? null, messages: turns.map(toMessage) };
  }

  async update(userId: string, id: string, patch: ChatPatch): Promise<ChatSummary> {
    await this.seeds.ensureChats(userId);
    const [row] = await this.db
      .update(chats)
      // Renaming or pinning isn't activity, so updatedAt (and the chat's place in the list) stays.
      .set({ ...patch, updatedAt: sql`${chats.updatedAt}` })
      .where(and(eq(chats.ownerId, userId), eq(chats.id, id)))
      .returning();
    if (!row) throw new NotFoundException('No chat with that id');
    return toSummary(row);
  }

  /** Takes the chat off the list; `restore` brings it back. */
  async archive(userId: string, id: string): Promise<void> {
    await this.setArchived(userId, id, new Date());
  }

  async restore(userId: string, id: string): Promise<void> {
    await this.setArchived(userId, id, null);
  }

  private async setArchived(userId: string, id: string, at: Date | null): Promise<void> {
    const rows = await this.db
      .update(chats)
      .set({ archivedAt: at, updatedAt: sql`${chats.updatedAt}` })
      .where(and(eq(chats.ownerId, userId), eq(chats.id, id)))
      .returning({ id: chats.id });
    if (rows.length === 0) throw new NotFoundException('No chat with that id');
  }
}

function toSummary(row: ChatRow): ChatSummary {
  return {
    id: row.id,
    title: row.title,
    project: row.project,
    sensitivity: row.sensitivity,
    pinned: row.pinned,
    calibrated: row.calibrated,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toMessage(row: MessageRow): Message {
  const at = row.createdAt.toISOString();
  if ('text' in row.body) return { id: row.id, role: 'user', text: row.body.text, at };
  return {
    id: row.id,
    role: 'assistant',
    routing: row.body.routing,
    blocks: row.body.blocks,
    durationMs: row.body.durationMs,
    vote: row.vote ?? null,
    at,
  };
}
