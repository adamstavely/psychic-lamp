import { DEFAULT_PREFERENCES, type Me, type Preferences, type PreferencesPatch } from '@donovan/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import type { Claims } from '../auth/claims.js';
import { DB, type Db } from '../db/db.module.js';
import { userPreferences, users } from '../db/schema.js';
import { identityFrom, initialsOf } from './identity.js';

@Injectable()
export class UsersService {
  /** Subject → user id, so routes that only need the id don't write the user row on every request. */
  readonly #ids = new Map<string, string>();

  constructor(@Inject(DB) private readonly db: Db) {}

  /** The caller's user id, creating their row the first time this process sees them. */
  async idFor(claims: Claims): Promise<string> {
    return this.#ids.get(claims.sub) ?? (await this.me(claims)).id;
  }

  /** The caller's user row, created on first sign-in and kept in step with their token's name and email. */
  async me(claims: Claims): Promise<Me> {
    const identity = identityFrom(claims);
    const [row] = await this.db
      .insert(users)
      .values(identity)
      .onConflictDoUpdate({
        target: users.subject,
        set: { name: identity.name, firstName: identity.firstName, email: identity.email, updatedAt: sql`now()` },
      })
      .returning();
    return {
      id: row!.id,
      name: row!.name,
      firstName: row!.firstName,
      email: row!.email,
      initials: initialsOf(row!.name),
    };
  }

  async preferences(userId: string): Promise<Preferences> {
    const [row] = await this.db.select().from(userPreferences).where(eq(userPreferences.userId, userId));
    return { ...DEFAULT_PREFERENCES, ...row?.values };
  }

  async updatePreferences(userId: string, patch: PreferencesPatch): Promise<Preferences> {
    const [row] = await this.db
      .insert(userPreferences)
      .values({ userId, values: patch })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: { values: sql`${userPreferences.values} || ${JSON.stringify(patch)}::jsonb`, updatedAt: sql`now()` },
      })
      .returning();
    return { ...DEFAULT_PREFERENCES, ...row!.values };
  }
}
