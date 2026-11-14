import type { ArtifactBody, ArtifactVersion, Block, Preferences, Route, SessionIntent } from '@donovan/contracts';
import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid().primaryKey().defaultRandom(),
  /** The identity provider's subject; the one stable link to the person's sign-in. */
  subject: text().notNull().unique(),
  name: text().notNull(),
  firstName: text().notNull(),
  email: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const userPreferences = pgTable('user_preferences', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** Only what the person changed; reads fill the rest from the contract's defaults. */
  values: jsonb().$type<Partial<Preferences>>().notNull().default({}),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** One row per thing a person has dealt with in their brief: a need done, a memo read, an update seen. */
export const briefState = pgTable(
  'brief_state',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text({ enum: ['need_done', 'memo_read', 'update_seen'] }).notNull(),
    key: text().notNull(),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.kind, t.key] })],
);

/** Canned content copied to a person on first use (their chats, artifacts, projects), so each set seeds once. */
export const userSeeds = pgTable(
  'user_seeds',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.name] })],
);

/** A chat belongs to one person; its id is unique for them (seeded chats keep the prototype's, e.g. "fraud"). */
export const chats = pgTable(
  'chats',
  {
    ownerId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    id: text().notNull(),
    title: text().notNull(),
    project: text(),
    sensitivity: text({ enum: ['Public', 'Internal', 'Confidential', 'Restricted'] }).notNull(),
    pinned: boolean().notNull().default(false),
    calibrated: boolean().notNull().default(false),
    intent: jsonb().$type<SessionIntent>(),
    /** Write tools the owner chose to always allow in this chat. */
    allowedTools: jsonb().$type<string[]>().notNull().default([]),
    /** Deleted from the list; kept so Undo can bring it back. */
    archivedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.ownerId, t.id] }), index('chats_owner_updated').on(t.ownerId, t.updatedAt)],
);

export interface AnswerBody {
  routing: Route[];
  blocks: Block[];
  durationMs: number;
}
/**
 * A turn's content. An answer's top-level routing, blocks and durationMs are the version shown; `versions` (all of
 * them, oldest first) and `shown` (from 1) appear once it has been regenerated.
 */
export type MessageBody = { text: string } | (AnswerBody & { versions?: AnswerBody[]; shown?: number });

export const messages = pgTable(
  'messages',
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerId: uuid().notNull(),
    chatId: text().notNull(),
    seq: integer().notNull(),
    role: text({ enum: ['user', 'assistant'] }).notNull(),
    body: jsonb().$type<MessageBody>().notNull(),
    vote: text({ enum: ['up', 'down'] }),
    voteReason: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('messages_chat_seq').on(t.ownerId, t.chatId, t.seq),
    foreignKey({ columns: [t.ownerId, t.chatId], foreignColumns: [chats.ownerId, chats.id] }).onDelete('cascade'),
  ],
);

/** The owner's verdict on a claim in a Calibrated answer. */
export const claimReviews = pgTable(
  'claim_reviews',
  {
    ownerId: uuid().notNull(),
    chatId: text().notNull(),
    claimId: text().notNull(),
    review: text({ enum: ['confirmed', 'disputed'] }).notNull(),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.ownerId, t.chatId, t.claimId] }),
    foreignKey({ columns: [t.ownerId, t.chatId], foreignColumns: [chats.ownerId, chats.id] }).onDelete('cascade'),
  ],
);

/** "I'll verify claim c4 by …": recorded at a Calibrated session's verification checkpoint. */
export const checkpoints = pgTable(
  'checkpoints',
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerId: uuid().notNull(),
    chatId: text().notNull(),
    claimId: text().notNull(),
    method: text().notNull(),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.ownerId, t.chatId], foreignColumns: [chats.ownerId, chats.id] }).onDelete('cascade'),
  ],
);

export const artifacts = pgTable(
  'artifacts',
  {
    ownerId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    id: text().notNull(),
    name: text().notNull(),
    kind: text({ enum: ['Doc', 'Code', 'Data'] }).notNull(),
    sensitivity: text({ enum: ['Public', 'Internal', 'Confidential', 'Restricted'] }).notNull(),
    chatId: text(),
    project: text(),
    sharedWith: jsonb().$type<string[]>().notNull().default([]),
    versions: jsonb().$type<ArtifactVersion[]>().notNull(),
    sources: jsonb().$type<string[]>().notNull().default([]),
    body: jsonb().$type<ArtifactBody>().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.ownerId, t.id] }), index('artifacts_owner_updated').on(t.ownerId, t.updatedAt)],
);

export const projects = pgTable(
  'projects',
  {
    ownerId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    id: text().notNull(),
    name: text().notNull(),
    team: text().notNull(),
    sensitivity: text({ enum: ['Public', 'Internal', 'Confidential', 'Restricted'] }).notNull(),
    calibrated: boolean().notNull().default(false),
    description: text().notNull().default(''),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.ownerId, t.id] })],
);

export const projectSources = pgTable(
  'project_sources',
  {
    ownerId: uuid().notNull(),
    projectId: text().notNull(),
    id: text().notNull(),
    kind: text({ enum: ['pdf', 'sheet', 'doc', 'slack', 'connector', 'web', 'dataset'] }).notNull(),
    title: text().notNull(),
    meta: text().notNull(),
    selected: boolean().notNull().default(true),
    position: integer().notNull(),
    /** Added by hand: a link's address, or the text of an upload or a paste (kept for when answers read sources). */
    url: text(),
    content: text(),
  },
  (t) => [
    primaryKey({ columns: [t.ownerId, t.projectId, t.id] }),
    foreignKey({ columns: [t.ownerId, t.projectId], foreignColumns: [projects.ownerId, projects.id] }).onDelete(
      'cascade',
    ),
  ],
);

export const projectNotes = pgTable(
  'project_notes',
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerId: uuid().notNull(),
    projectId: text().notNull(),
    text: text().notNull(),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.ownerId, t.projectId], foreignColumns: [projects.ownerId, projects.id] }).onDelete(
      'cascade',
    ),
  ],
);

/** Who a project is shared with, as the owner set it. */
export const projectShares = pgTable(
  'project_shares',
  {
    ownerId: uuid().notNull(),
    projectId: text().notNull(),
    recipientId: text().notNull(),
    kind: text({ enum: ['person', 'group'] }).notNull(),
    name: text().notNull(),
    detail: text(),
    level: text({ enum: ['viewer', 'editor'] }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.ownerId, t.projectId, t.recipientId] }),
    foreignKey({ columns: [t.ownerId, t.projectId], foreignColumns: [projects.ownerId, projects.id] }).onDelete(
      'cascade',
    ),
  ],
);

/** Read and dismissed marks on notifications that aren't memos or updates (those share the Brief's marks). */
export const notificationState = pgTable(
  'notification_state',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    key: text().notNull(),
    readAt: timestamp({ withTimezone: true }),
    dismissedAt: timestamp({ withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);
