import type {
  ArtifactBody,
  ArtifactVersion,
  Attachment,
  Block,
  CitedText,
  Claim,
  Preferences,
  RegistryAccess,
  RegistryItem,
  Route,
  SessionIntent,
} from '@donovan/contracts';
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
    /** The project it's filed under (one of the owner's), and that project's name, for display only. */
    projectId: text(),
    project: text(),
    sensitivity: text({ enum: ['Public', 'Internal', 'Confidential', 'Restricted'] }).notNull(),
    pinned: boolean().notNull().default(false),
    calibrated: boolean().notNull().default(false),
    intent: jsonb().$type<SessionIntent>(),
    persona: text({ enum: ['balanced', 'red-cell', 'historian', 'collection'] })
      .notNull()
      .default('balanced'),
    knowledge: text({ enum: ['workspace', 'training', 'live'] })
      .notNull()
      .default('workspace'),
    /** Write tools the owner chose to always allow in this chat. */
    allowedTools: jsonb().$type<string[]>().notNull().default([]),
    /** Deleted from the list; kept so Undo can bring it back. */
    archivedAt: timestamp({ withTimezone: true }),
    /** Bumped with every change to what search sees (title, turns, shown versions); the index records which it has. */
    searchVersion: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.ownerId, t.id] }),
    index('chats_owner_updated').on(t.ownerId, t.updatedAt),
    foreignKey({ columns: [t.ownerId, t.projectId], foreignColumns: [projects.ownerId, projects.id] }),
  ],
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
export type MessageBody =
  { text: string; attachments?: Attachment[] } | (AnswerBody & { versions?: AnswerBody[]; shown?: number });

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
    /** A question its sender marked to come back to (user messages). */
    bookmarked: boolean().notNull().default(false),
    /** The client's id for the send that saved this message (user messages), so a retry isn't saved twice. */
    requestId: uuid(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('messages_chat_seq').on(t.ownerId, t.chatId, t.seq),
    unique('messages_chat_request').on(t.ownerId, t.chatId, t.requestId),
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
    /** The project it's filed under (one of the owner's), and that project's name, for display only. */
    projectId: text(),
    project: text(),
    sharedWith: jsonb().$type<string[]>().notNull().default([]),
    versions: jsonb().$type<ArtifactVersion[]>().notNull(),
    sources: jsonb().$type<string[]>().notNull().default([]),
    body: jsonb().$type<ArtifactBody>().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.ownerId, t.id] }),
    index('artifacts_owner_updated').on(t.ownerId, t.updatedAt),
    index('artifacts_owner_project').on(t.ownerId, t.projectId),
    foreignKey({ columns: [t.ownerId, t.projectId], foreignColumns: [projects.ownerId, projects.id] }),
  ],
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

/** Questions asked in a project and their answers: the project's chat. */
export const projectAnswers = pgTable(
  'project_answers',
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerId: uuid().notNull(),
    projectId: text().notNull(),
    question: text().notNull(),
    answer: jsonb().$type<CitedText>().notNull(),
    sourcesRead: integer().notNull(),
    claims: jsonb().$type<Claim[]>(),
    checkpoint: text(),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('project_answers_project_at').on(t.ownerId, t.projectId, t.at),
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

/**
 * Build mode's registry: skills, MCP servers, agents, workflows, models, datasets, spaces, collections and prompts.
 * Shared by everyone, unlike Assist's per-person tables; an item belongs to a team (the seeded catalog) or to the person
 * who registered it. What every kind has is in columns; the rest is `details`, checked against the kind's contract.
 */
export const registryItems = pgTable(
  'registry_items',
  {
    kind: text({
      enum: ['skill', 'server', 'agent', 'workflow', 'model', 'dataset', 'space', 'collection', 'prompt'],
    }).notNull(),
    id: text().notNull(),
    name: text().notNull(),
    slug: text().notNull(),
    version: text().notNull(),
    sensitivity: text({ enum: ['Public', 'Internal', 'Confidential', 'Restricted'] }).notNull(),
    summary: text().notNull(),
    ownerTeam: text(),
    ownerId: uuid().references(() => users.id, { onDelete: 'set null' }),
    ownerName: text().notNull(),
    /** Who sent its latest version to review (the owner, or whoever edited a team's item); they can't review it. */
    submittedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    status: text({ enum: ['draft', 'pending', 'changes-requested', 'published', 'rejected'] }).notNull(),
    access: jsonb().$type<RegistryAccess>(),
    /** Which round of review it's in: 1 at first, one more each time it's resubmitted. */
    reviewRound: integer().notNull().default(1),
    details: jsonb().$type<RegistryItem['details']>().notNull(),
    /** Bumped with every change, in the same transaction; search records the version it indexed (see SearchBackfill). */
    searchVersion: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.kind, t.id] }),
    unique('registry_items_kind_slug').on(t.kind, t.slug),
    index('registry_items_owner').on(t.ownerId),
    index('registry_items_status').on(t.status),
  ],
);

/** Where each person has installed a registry item (installs are recorded; nothing is actually configured yet). */
/** Every review decision, kept for good: two approvals in a round publish an item; one "changes" or "reject" stops it. */
export const registryReviews = pgTable(
  'registry_reviews',
  {
    kind: text({
      enum: ['skill', 'server', 'agent', 'workflow', 'model', 'dataset', 'space', 'collection', 'prompt'],
    }).notNull(),
    itemId: text().notNull(),
    round: integer().notNull(),
    reviewerId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reviewerName: text().notNull(),
    decision: text({ enum: ['approve', 'changes', 'reject'] }).notNull(),
    note: text().notNull().default(''),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One decision per reviewer per round.
    primaryKey({ columns: [t.kind, t.itemId, t.round, t.reviewerId] }),
    foreignKey({ columns: [t.kind, t.itemId], foreignColumns: [registryItems.kind, registryItems.id] }).onDelete(
      'cascade',
    ),
  ],
);

/** The workspace's governance policies; missing rows take their defaults (see governance.service.ts). */
export const governancePolicies = pgTable('governance_policies', {
  id: text({
    enum: ['read-only-default', 'per-tool-approval', 'confidential-in-workspace', 'restricted-auto-routing'],
  }).primaryKey(),
  enabled: boolean().notNull(),
  updatedBy: text(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const registryInstalls = pgTable(
  'registry_installs',
  {
    ownerId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text({
      enum: ['skill', 'server', 'agent', 'workflow', 'model', 'dataset', 'space', 'collection', 'prompt'],
    }).notNull(),
    itemId: text().notNull(),
    client: text({ enum: ['donovan-chat', 'claude-desktop', 'claude-code', 'cursor', 'vscode'] }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.ownerId, t.kind, t.itemId, t.client] }),
    foreignKey({ columns: [t.kind, t.itemId], foreignColumns: [registryItems.kind, registryItems.id] }).onDelete(
      'cascade',
    ),
  ],
);

/** Collections the person attached to their projects; attaching applies the collection's ceiling tier to the project. */
export const projectCollections = pgTable(
  'project_collections',
  {
    ownerId: uuid().notNull(),
    projectId: text().notNull(),
    collectionId: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.ownerId, t.projectId, t.collectionId] }),
    foreignKey({ columns: [t.ownerId, t.projectId], foreignColumns: [projects.ownerId, projects.id] }).onDelete(
      'cascade',
    ),
  ],
);
