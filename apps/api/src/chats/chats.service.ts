import type {
  AssistantMessage,
  Block,
  Chat,
  ChatPatch,
  ChatSummary,
  Message,
  NewChat,
  SendMessage,
  ToolDecision,
  ToolDecisionResult,
  UserMessage,
  Vote,
} from '@donovan/contracts';
import { randomBytes } from 'node:crypto';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { DB, type Db } from '../db/db.module.js';
import { chats, messages } from '../db/schema.js';
import { SeedService } from '../seed/seed.service.js';
import { decisionReply, pickReply, type Reply } from './replies.js';

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

  /** Starts a chat titled from its first message; the message itself is sent with `send`. */
  async create(userId: string, body: NewChat): Promise<ChatSummary> {
    await this.seeds.ensureChats(userId);
    const [row] = await this.db
      .insert(chats)
      .values({ ownerId: userId, id: newChatId(), title: titleFrom(body.text), sensitivity: body.sensitivity })
      .returning();
    return toSummary(row!);
  }

  /** Saves the person's message and Donovan's (canned) answer, and returns both for streaming. */
  async send(
    userId: string,
    chatId: string,
    body: SendMessage,
  ): Promise<{ user: UserMessage; answer: AssistantMessage }> {
    await this.get(userId, chatId);
    const reply = pickReply(body.text, body.model);
    return this.db.transaction(async (tx) => {
      const seq = await nextSeq(tx, userId, chatId);
      const [u] = await tx
        .insert(messages)
        .values({ ownerId: userId, chatId, seq, role: 'user', body: { text: body.text } })
        .returning();
      const [a] = await tx
        .insert(messages)
        .values({ ownerId: userId, chatId, seq: seq + 1, role: 'assistant', body: answerBody(reply) })
        .returning();
      await tx
        .update(chats)
        .set({ updatedAt: new Date() })
        .where(and(eq(chats.ownerId, userId), eq(chats.id, chatId)));
      return { user: toMessage(u!) as UserMessage, answer: toMessage(a!) as AssistantMessage };
    });
  }

  /** Approves or denies a write tool that's waiting, and adds Donovan's reply to the decision. */
  async decide(userId: string, chatId: string, toolId: string, body: ToolDecision): Promise<ToolDecisionResult> {
    await this.get(userId, chatId);
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(messages)
        .where(and(eq(messages.ownerId, userId), eq(messages.chatId, chatId), eq(messages.role, 'assistant')));
      const row = rows.find(
        (r) => 'blocks' in r.body && r.body.blocks.some((b) => b.type === 'tool' && b.id === toolId),
      );
      if (!row || !('blocks' in row.body)) throw new NotFoundException('No tool call with that id in this chat');
      const tool = row.body.blocks.find(
        (b): b is Extract<Block, { type: 'tool' }> => b.type === 'tool' && b.id === toolId,
      )!;
      if (tool.status !== 'pending') throw new ConflictException(`That tool call is already ${tool.status}`);

      const approved = body.decision === 'approve';
      const decided: Block = approved
        ? { ...tool, status: 'done', durationMs: 1100, result: `Done · ${tool.summary.replace(/\s*\(write\)$/, '')}` }
        : { ...tool, status: 'denied', durationMs: null, result: null };
      const blocks = row.body.blocks.map((b) => (b === tool ? decided : b));
      const [updated] = await tx
        .update(messages)
        .set({ body: { ...row.body, blocks } })
        .where(eq(messages.id, row.id))
        .returning();

      if (approved && body.always) {
        await tx
          .update(chats)
          .set({
            allowedTools: sql`(select jsonb_agg(distinct t) from jsonb_array_elements_text(${chats.allowedTools} || ${JSON.stringify([tool.name])}::jsonb) t)`,
          })
          .where(and(eq(chats.ownerId, userId), eq(chats.id, chatId)));
      }

      const seq = await nextSeq(tx, userId, chatId);
      const [reply] = await tx
        .insert(messages)
        .values({
          ownerId: userId,
          chatId,
          seq,
          role: 'assistant',
          body: answerBody(decisionReply(tool.name, tool.server, approved)),
        })
        .returning();
      await tx
        .update(chats)
        .set({ updatedAt: new Date() })
        .where(and(eq(chats.ownerId, userId), eq(chats.id, chatId)));
      return { updated: toMessage(updated!) as AssistantMessage, reply: toMessage(reply!) as AssistantMessage };
    });
  }

  async vote(userId: string, chatId: string, messageId: string, body: Vote): Promise<void> {
    const rows = await this.db
      .update(messages)
      .set({ vote: body.vote, voteReason: body.vote === 'down' ? (body.reason ?? null) : null })
      .where(
        and(
          eq(messages.ownerId, userId),
          eq(messages.chatId, chatId),
          eq(messages.id, messageId),
          eq(messages.role, 'assistant'),
        ),
      )
      .returning({ id: messages.id });
    if (rows.length === 0) throw new NotFoundException('No answer with that id in this chat');
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

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

async function nextSeq(tx: Tx, userId: string, chatId: string): Promise<number> {
  const [r] = await tx
    .select({ max: sql<number | null>`max(${messages.seq})` })
    .from(messages)
    .where(and(eq(messages.ownerId, userId), eq(messages.chatId, chatId)));
  return (r?.max ?? -1) + 1;
}

/** Answers take longer the more they do, as in the prototype's "Worked for" line. */
function answerBody(reply: Reply) {
  return {
    routing: reply.routing,
    blocks: reply.blocks,
    durationMs: Math.round((1.4 + reply.blocks.length * 0.9) * 1000),
  };
}

/** Eight lowercase letters and digits: short enough for a URL, unique enough per person. */
function newChatId(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return [...randomBytes(8)].map((b) => alphabet[b % alphabet.length]).join('');
}

/** The first sentence or line, cut at a word under 60 characters. */
export function titleFrom(text: string): string {
  const first = text
    .trim()
    .split(/(?<=[.?!])\s|\n/)[0]!
    .trim();
  if (first.length <= 60) return first;
  const cut = first.slice(0, 60);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 30 ? cut.lastIndexOf(' ') : 60).trimEnd()}…`;
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
