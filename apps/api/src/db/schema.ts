import type { Block, Preferences, Route, SessionIntent } from '@donovan/contracts';
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
    /** Deleted from the list; kept so Undo can bring it back. */
    archivedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.ownerId, t.id] }), index('chats_owner_updated').on(t.ownerId, t.updatedAt)],
);

export type MessageBody = { text: string } | { routing: Route[]; blocks: Block[]; durationMs: number };

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
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('messages_chat_seq').on(t.ownerId, t.chatId, t.seq),
    foreignKey({ columns: [t.ownerId, t.chatId], foreignColumns: [chats.ownerId, chats.id] }).onDelete('cascade'),
  ],
);
