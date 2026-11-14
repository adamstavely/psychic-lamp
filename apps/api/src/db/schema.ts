import type { Preferences } from '@donovan/contracts';
import { jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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
