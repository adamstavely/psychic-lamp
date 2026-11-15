import type {
  AssistantMessage,
  Attachment,
  Block,
  ModelChoice,
  Chat,
  ChatPatch,
  ChatSummary,
  ClaimReview,
  Message,
  NewCheckpoint,
  ProvenanceManifest,
  NewChat,
  SendMessage,
  ToolDecision,
  ToolDecisionResult,
  UserMessage,
  Vote,
} from '@donovan/contracts';
import { KNOWLEDGE_SOURCES, PERSONAS } from '@donovan/contracts/defaults';
import { createHash, randomBytes } from 'node:crypto';
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { DB, type Db } from '../db/db.module.js';
import { type AnswerBody, artifacts, chats, checkpoints, claimReviews, messages, projects } from '../db/schema.js';
import { GovernanceService } from '../governance/governance.service.js';
import { SeedService } from '../seed/seed.service.js';
import { ChatSearch, chatText } from '../search/chat-search.js';
import { calibrateReply } from './claims.js';
import { contextFor } from './context.js';
import { allowListed, decisionReply, pickReply, shapeReply, withFiles, type Reply } from './replies.js';

type ChatRow = typeof chats.$inferSelect;
type MessageRow = typeof messages.$inferSelect;

@Injectable()
export class ChatsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly seeds: SeedService,
    private readonly chatSearch: ChatSearch,
    private readonly governance: GovernanceService,
  ) {}

  /** The write tools that may run without asking in a chat: all of them when the workspace turns approval off. */
  private async mayRun(chat: Chat): Promise<readonly string[] | 'all'> {
    return (await this.governance.enabled('per-tool-approval')) ? chat.allowedTools : 'all';
  }

  /**
   * Keeps the chat's search entry in step with its title and turns, at the chat's current searchVersion. The version
   * is bumped in the same transaction as the change (see bumpSearch), so if this index fails, reconciliation sees the
   * entry is behind and redoes it.
   *
   * The version is read before the content, never after: content that changes in between is then newer than the
   * version it's filed under, which reconciliation repairs; the other way round, old content would claim the new
   * version and look current for good.
   */
  private async reindex(userId: string, id: string): Promise<void> {
    const [row] = await this.db
      .select({ version: chats.searchVersion })
      .from(chats)
      .where(and(eq(chats.ownerId, userId), eq(chats.id, id)));
    const chat = await this.get(userId, id);
    await this.chatSearch.index([
      { ownerId: userId, id, title: chat.title, text: chatText(chat.messages), version: row?.version ?? 0 },
    ]);
  }

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
    const [turns, reviews, checks] = await Promise.all([
      this.db
        .select()
        .from(messages)
        .where(and(eq(messages.ownerId, userId), eq(messages.chatId, id)))
        .orderBy(asc(messages.seq)),
      this.db
        .select()
        .from(claimReviews)
        .where(and(eq(claimReviews.ownerId, userId), eq(claimReviews.chatId, id))),
      this.db
        .select()
        .from(checkpoints)
        .where(and(eq(checkpoints.ownerId, userId), eq(checkpoints.chatId, id)))
        .orderBy(asc(checkpoints.at)),
    ]);
    const verdicts = new Map(reviews.map((r) => [r.claimId, r.review]));
    const thread = turns.map(toMessage).map((m) => withReviews(m, verdicts));
    return {
      ...toSummary(row),
      intent: row.intent ?? null,
      persona: row.persona,
      knowledge: row.knowledge,
      allowedTools: row.allowedTools,
      messages: thread,
      context: contextFor({ calibrated: row.calibrated, project: row.project, persona: row.persona }, thread),
      checkpoints: checks.map((c) => ({ claimId: c.claimId, method: c.method, at: c.at.toISOString() })),
    };
  }

  /** Confirms or disputes a claim, or (null) clears the verdict. */
  async reviewClaim(userId: string, chatId: string, claimId: string, body: ClaimReview): Promise<void> {
    await this.assertClaim(userId, chatId, claimId);
    const where = and(
      eq(claimReviews.ownerId, userId),
      eq(claimReviews.chatId, chatId),
      eq(claimReviews.claimId, claimId),
    );
    if (body.review === null) await this.db.delete(claimReviews).where(where);
    else
      await this.db
        .insert(claimReviews)
        .values({ ownerId: userId, chatId, claimId, review: body.review })
        .onConflictDoUpdate({
          target: [claimReviews.ownerId, claimReviews.chatId, claimReviews.claimId],
          set: { review: body.review, at: new Date() },
        });
  }

  async addCheckpoint(userId: string, chatId: string, body: NewCheckpoint): Promise<void> {
    await this.assertClaim(userId, chatId, body.claimId);
    await this.db.insert(checkpoints).values({ ownerId: userId, chatId, claimId: body.claimId, method: body.method });
  }

  /** The chat as a provenance record: its settings, routing, sources, claims with verdicts, and a hash of the turns. */
  async export(userId: string, chatId: string, exportedBy: string): Promise<ProvenanceManifest> {
    const chat = await this.get(userId, chatId);
    const answers = chat.messages.filter((m) => m.role === 'assistant');
    const routing = uniqueBy(
      answers.flatMap((m) => m.routing),
      (r) => `${r.kind}:${r.name}`,
    );
    const tools = answers.flatMap((m) => m.blocks.filter((b) => b.type === 'tool'));
    const claimSources = answers.flatMap((m) => m.blocks.flatMap((b) => (b.type === 'claims' ? b.items : [])));
    const sources = [
      ...tools.map((t) => ({ id: `tool:${t.id}`, label: `${t.name} · ${t.server}`, detail: t.summary })),
      ...claimSources.flatMap((c) =>
        c.source ? [{ id: `source:${c.id}`, label: c.source.title, detail: c.source.publisher }] : [],
      ),
    ];
    const {
      context: _context,
      messages: turns,
      checkpoints: checks,
      persona: _persona,
      knowledge: _knowledge,
      allowedTools: _allowed,
      ...summary
    } = chat;
    return {
      format: 'donovan.provenance/v1',
      exportedAt: new Date().toISOString(),
      exportedBy,
      chat: summary,
      settings: [
        { label: 'Model', value: chat.context.model },
        { label: 'Mode', value: chat.calibrated ? 'Calibrated' : 'Standard' },
        { label: 'Persona', value: PERSONAS.find((p) => p.id === chat.persona)!.label },
        { label: 'Knowledge', value: KNOWLEDGE_SOURCES.find((k) => k.id === chat.knowledge)!.label },
        { label: 'Sensitivity', value: chat.sensitivity },
        {
          label: 'Context window',
          value: `${chat.context.parts.reduce((n, p) => n + p.tokens, 0).toLocaleString('en-US')} of ${chat.context.limit.toLocaleString('en-US')} tokens`,
        },
      ],
      routing,
      sources,
      claims: claimSources,
      checkpoints: checks,
      messages: turns,
      contentHash: `sha256:${createHash('sha256').update(JSON.stringify(turns)).digest('hex')}`,
    };
  }

  private async assertClaim(userId: string, chatId: string, claimId: string): Promise<void> {
    const chat = await this.get(userId, chatId);
    const found = chat.messages.some(
      (m) =>
        m.role === 'assistant' && m.blocks.some((b) => b.type === 'claims' && b.items.some((c) => c.id === claimId)),
    );
    if (!found) throw new NotFoundException('No claim with that id in this chat');
  }

  async update(userId: string, id: string, patch: ChatPatch): Promise<ChatSummary> {
    await this.seeds.ensureChats(userId);
    const filed =
      patch.projectId === undefined
        ? {}
        : patch.projectId === null
          ? { projectId: null, project: null }
          : await this.project(userId, patch.projectId).then((p) => ({ projectId: p.id, project: p.name }));
    const [row] = await this.db
      .update(chats)
      // Renaming, pinning or filing isn't activity, so updatedAt (and the chat's place in the list) stays.
      .set({
        ...patch,
        ...filed,
        updatedAt: sql`${chats.updatedAt}`,
        ...(patch.title ? { searchVersion: sql`${chats.searchVersion} + 1` } : {}),
      })
      .where(and(eq(chats.ownerId, userId), eq(chats.id, id)))
      .returning();
    if (!row) throw new NotFoundException('No chat with that id');
    if (patch.title) await this.reindex(userId, id);
    return toSummary(row);
  }

  /** Starts a chat titled from its first message, in a project if asked; the message itself is sent with `send`. */
  async create(userId: string, body: NewChat): Promise<ChatSummary> {
    await this.seeds.ensureChats(userId);
    const project = body.projectId ? await this.project(userId, body.projectId) : null;
    const [row] = await this.db
      .insert(chats)
      .values({
        ownerId: userId,
        id: newChatId(),
        title: titleFrom(body.text),
        sensitivity: body.sensitivity,
        calibrated: body.calibrated || !!project?.calibrated,
        projectId: project?.id ?? null,
        project: project?.name ?? null,
      })
      .returning();
    await this.reindex(userId, row!.id);
    return toSummary(row!);
  }

  /** Saves the person's message and Donovan's (canned) answer, and returns both for streaming. */
  async send(
    userId: string,
    chatId: string,
    body: SendMessage,
  ): Promise<{ user: UserMessage; answer: AssistantMessage }> {
    const chat = await this.get(userId, chatId);
    const files = await this.attachments(userId, body.attachments);
    const answered = allowListed(
      withFiles(shapeReply(pickReply(body.text, body.model), chat.persona, chat.knowledge), files),
      await this.mayRun(chat),
    );
    const reply = chat.calibrated ? calibrateReply(answered, files) : answered;
    const sent = await this.db.transaction(async (tx) => {
      await lockChat(tx, userId, chatId);
      const seq = await nextSeq(tx, userId, chatId);
      // A retry of a send that was saved (its response lost on the way back) returns that turn again.
      if (body.requestId) {
        const [saved] = await tx
          .select()
          .from(messages)
          .where(
            and(eq(messages.ownerId, userId), eq(messages.chatId, chatId), eq(messages.requestId, body.requestId)),
          );
        if (saved) {
          const [reply] = await tx
            .select()
            .from(messages)
            .where(and(eq(messages.ownerId, userId), eq(messages.chatId, chatId), eq(messages.seq, saved.seq + 1)));
          return { user: toMessage(saved) as UserMessage, answer: toMessage(reply!) as AssistantMessage };
        }
      }
      const [u] = await tx
        .insert(messages)
        .values({
          ownerId: userId,
          chatId,
          seq,
          role: 'user',
          body: files.length ? { text: body.text, attachments: files } : { text: body.text },
          requestId: body.requestId ?? null,
        })
        .returning();
      const [a] = await tx
        .insert(messages)
        .values({ ownerId: userId, chatId, seq: seq + 1, role: 'assistant', body: answerBody(reply) })
        .returning();
      await tx
        .update(chats)
        .set({ updatedAt: new Date(), searchVersion: sql`${chats.searchVersion} + 1` })
        .where(and(eq(chats.ownerId, userId), eq(chats.id, chatId)));
      return { user: toMessage(u!) as UserMessage, answer: toMessage(a!) as AssistantMessage };
    });
    await this.reindex(userId, chatId);
    return sent;
  }

  /** One of the person's own projects, to file a chat under; someone else's can't be. */
  private async project(userId: string, id: string): Promise<{ id: string; name: string; calibrated: boolean }> {
    const [p] = await this.db
      .select({ id: projects.id, name: projects.name, calibrated: projects.calibrated })
      .from(projects)
      .where(and(eq(projects.ownerId, userId), eq(projects.id, id)));
    if (!p) throw new BadRequestException("That isn't one of your projects");
    return p;
  }

  /** The person's own artifacts, in the order asked for; any other id is refused rather than dropped. */
  private async attachments(userId: string, ids: string[]): Promise<Attachment[]> {
    if (ids.length === 0) return [];
    const unique = [...new Set(ids)];
    const rows = await this.db
      .select({ id: artifacts.id, name: artifacts.name, body: artifacts.body })
      .from(artifacts)
      .where(and(eq(artifacts.ownerId, userId), inArray(artifacts.id, unique)));
    if (rows.length !== unique.length) throw new BadRequestException("An attachment isn't one of your artifacts");
    const byId = new Map(rows.map((r) => [r.id, r]));
    return unique.map((id) => {
      const r = byId.get(id)!;
      return { artifactId: r.id, name: r.name, tokens: Math.round(JSON.stringify(r.body).length / 4) };
    });
  }

  /** Approves or denies a write tool that's waiting, and adds Donovan's reply to the decision. */
  async decide(userId: string, chatId: string, toolId: string, body: ToolDecision): Promise<ToolDecisionResult> {
    await this.get(userId, chatId);
    const decided = await this.db.transaction(async (tx) => {
      // Before reading the tool's status: two decisions on one tool take turns, and the second sees the first's.
      await lockChat(tx, userId, chatId);
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
        .set({
          body: (() => {
            const versions = versionsOf(row.body);
            const shown = row.body.shown ?? versions.length;
            versions[shown - 1] = { ...versions[shown - 1]!, blocks };
            return showing(versions, shown);
          })(),
        })
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
        .set({ updatedAt: new Date(), searchVersion: sql`${chats.searchVersion} + 1` })
        .where(and(eq(chats.ownerId, userId), eq(chats.id, chatId)));
      return { updated: toMessage(updated!) as AssistantMessage, reply: toMessage(reply!) as AssistantMessage };
    });
    await this.reindex(userId, chatId);
    return decided;
  }

  /** Adds a new version of an answer, from the question before it, and shows it. */
  async regenerate(userId: string, chatId: string, messageId: string, model: ModelChoice): Promise<AssistantMessage> {
    const chat = await this.get(userId, chatId);
    const mayRun = await this.mayRun(chat);
    const regenerated = await this.db.transaction(async (tx) => {
      // Before reading the versions: concurrent regenerations each add theirs instead of replacing the others'.
      await lockChat(tx, userId, chatId);
      const [row] = await tx
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.ownerId, userId),
            eq(messages.chatId, chatId),
            eq(messages.id, messageId),
            eq(messages.role, 'assistant'),
          ),
        );
      if (!row || 'text' in row.body) throw new NotFoundException('No answer with that id in this chat');
      const [question] = await tx
        .select()
        .from(messages)
        .where(and(eq(messages.ownerId, userId), eq(messages.chatId, chatId), eq(messages.seq, row.seq - 1)));
      const asked = question && 'text' in question.body ? question.body : { text: '' };
      const versions = versionsOf(row.body);
      const files = asked.attachments ?? [];
      const answered = allowListed(
        withFiles(shapeReply(pickReply(asked.text, model, versions.length), chat.persona, chat.knowledge), files),
        mayRun,
      );
      const next = answerBody(chat.calibrated ? calibrateReply(answered, files) : answered);
      const [saved] = await tx
        .update(messages)
        .set({ body: showing([...versions, next], versions.length + 1), vote: null, voteReason: null })
        .where(eq(messages.id, row.id))
        .returning();
      await bumpSearch(tx, userId, chatId);
      return toMessage(saved!) as AssistantMessage;
    });
    await this.reindex(userId, chatId);
    return regenerated;
  }

  /** Shows an earlier (or later) version of an answer. */
  async showVersion(userId: string, chatId: string, messageId: string, version: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Read under the lock, so a regeneration or decision in between isn't written over.
      await lockChat(tx, userId, chatId);
      const [row] = await tx
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.ownerId, userId),
            eq(messages.chatId, chatId),
            eq(messages.id, messageId),
            eq(messages.role, 'assistant'),
          ),
        );
      if (!row || 'text' in row.body) throw new NotFoundException('No answer with that id in this chat');
      const versions = versionsOf(row.body);
      if (version > versions.length) throw new NotFoundException(`This answer has ${versions.length} versions`);
      await tx
        .update(messages)
        .set({ body: showing(versions, version) })
        .where(eq(messages.id, row.id));
      await bumpSearch(tx, userId, chatId);
    });
    await this.reindex(userId, chatId);
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

  /** Stops a write tool running without asking in this chat: from now on it waits for approval again. */
  async revokeTool(userId: string, chatId: string, tool: string): Promise<void> {
    const [row] = await this.db
      .update(chats)
      .set({
        allowedTools: sql`coalesce((select jsonb_agg(t) from jsonb_array_elements_text(${chats.allowedTools}) t where t <> ${tool}), '[]'::jsonb)`,
        updatedAt: sql`${chats.updatedAt}`,
      })
      .where(and(eq(chats.ownerId, userId), eq(chats.id, chatId)))
      .returning({ id: chats.id });
    if (!row) throw new NotFoundException('No chat with that id');
  }

  /** Marks one of the person's own questions to come back to, or unmarks it. */
  async bookmark(userId: string, chatId: string, messageId: string, bookmarked: boolean): Promise<void> {
    const rows = await this.db
      .update(messages)
      .set({ bookmarked })
      .where(
        and(
          eq(messages.ownerId, userId),
          eq(messages.chatId, chatId),
          eq(messages.id, messageId),
          eq(messages.role, 'user'),
        ),
      )
      .returning({ id: messages.id });
    if (rows.length === 0) throw new NotFoundException('No question with that id in this chat');
  }

  /** Takes the chat off the list; `restore` brings it back. */
  async archive(userId: string, id: string): Promise<void> {
    await this.setArchived(userId, id, new Date());
    await this.chatSearch.remove(userId, id);
  }

  async restore(userId: string, id: string): Promise<void> {
    await this.setArchived(userId, id, null);
    await this.reindex(userId, id);
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

/** Marks the chat's search entry as behind (it's re-indexed after the transaction, or by reconciliation). */
async function bumpSearch(tx: Tx, userId: string, chatId: string): Promise<void> {
  await tx
    .update(chats)
    .set({ searchVersion: sql`${chats.searchVersion} + 1` })
    .where(and(eq(chats.ownerId, userId), eq(chats.id, chatId)));
}

/**
 * Locks the chat's row until the transaction ends. Every transaction that changes a chat's turns takes it first, before
 * reading anything it will change, so concurrent writers to one chat (two sends, two decisions on one tool, two
 * regenerations of one answer) take turns and each sees the last one's work, rather than claiming the same position
 * or writing over it. Taking this one lock first, always, also means they can't deadlock on each other.
 */
async function lockChat(tx: Tx, userId: string, chatId: string): Promise<void> {
  await tx
    .select({ id: chats.id })
    .from(chats)
    .where(and(eq(chats.ownerId, userId), eq(chats.id, chatId)))
    .for('update');
}

/** The next free position in a chat; call it under lockChat. */
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

function withReviews(m: Message, verdicts: Map<string, 'confirmed' | 'disputed'>): Message {
  if (m.role !== 'assistant' || verdicts.size === 0) return m;
  return {
    ...m,
    blocks: m.blocks.map((b) =>
      b.type === 'claims' ? { ...b, items: b.items.map((c) => ({ ...c, review: verdicts.get(c.id) ?? null })) } : b,
    ),
  };
}

function uniqueBy<T>(items: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((t) => !seen.has(key(t)) && !!seen.add(key(t)));
}

function toSummary(row: ChatRow): ChatSummary {
  return {
    id: row.id,
    title: row.title,
    projectId: row.projectId,
    project: row.project,
    sensitivity: row.sensitivity,
    pinned: row.pinned,
    calibrated: row.calibrated,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toMessage(row: MessageRow): Message {
  const at = row.createdAt.toISOString();
  if ('text' in row.body)
    return {
      id: row.id,
      role: 'user',
      text: row.body.text,
      ...(row.body.attachments?.length ? { attachments: row.body.attachments } : {}),
      ...(row.bookmarked ? { bookmarked: true } : {}),
      at,
      requestId: row.requestId,
    };
  const versions = versionsOf(row.body);
  return {
    id: row.id,
    role: 'assistant',
    routing: row.body.routing,
    blocks: row.body.blocks,
    durationMs: row.body.durationMs,
    versions,
    version: row.body.shown ?? versions.length,
    vote: row.vote ?? null,
    at,
  };
}

/** An answer's versions, oldest first (one, until it has been regenerated). */
function versionsOf(body: AnswerBody & { versions?: AnswerBody[] }): AnswerBody[] {
  return body.versions ?? [{ routing: body.routing, blocks: body.blocks, durationMs: body.durationMs }];
}

/** The body showing version `shown` of `versions`. */
function showing(versions: AnswerBody[], shown: number): AnswerBody & { versions: AnswerBody[]; shown: number } {
  return { ...versions[shown - 1]!, versions, shown };
}
