import type { Preferences } from '@donovan/contracts';
import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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
