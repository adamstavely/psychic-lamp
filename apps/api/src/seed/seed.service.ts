import { Inject, Injectable } from '@nestjs/common';
import { DB, type Db } from '../db/db.module.js';
import { artifacts, chats, messages, userSeeds } from '../db/schema.js';
import { SEED_ARTIFACTS } from './artifacts.fixture.js';
import { SEED_CHATS } from './chats.fixture.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const MINUTE = 60_000;

/** Copies the canned content to a person the first time they need it, once per set, safely under concurrency. */
@Injectable()
export class SeedService {
  constructor(@Inject(DB) private readonly db: Db) {}

  ensureChats(userId: string, now = new Date()): Promise<boolean> {
    return this.once(userId, 'chats', async (tx) => {
      for (const chat of SEED_CHATS) {
        const updatedAt = new Date(now.getTime() - chat.minutesAgo * MINUTE);
        await tx.insert(chats).values({
          ownerId: userId,
          id: chat.id,
          title: chat.title,
          project: chat.project,
          sensitivity: chat.sensitivity,
          pinned: chat.pinned,
          calibrated: chat.calibrated,
          intent: chat.intent,
          createdAt: new Date(updatedAt.getTime() - chat.messages.length * 2 * MINUTE),
          updatedAt,
        });
        await tx.insert(messages).values(
          chat.messages.map((m, seq) => ({
            ownerId: userId,
            chatId: chat.id,
            seq,
            role: m.role,
            body:
              m.role === 'user' ? { text: m.text } : { routing: m.routing, blocks: m.blocks, durationMs: m.durationMs },
            // Spread the turns over the minutes before the chat's last activity.
            createdAt: new Date(updatedAt.getTime() - (chat.messages.length - 1 - seq) * 2 * MINUTE),
          })),
        );
      }
    });
  }

  /** Copies the canned artifacts; true when this call did it (so the caller can index them for search). */
  ensureArtifacts(userId: string, now = new Date()): Promise<boolean> {
    return this.once(userId, 'artifacts', async (tx) => {
      await tx.insert(artifacts).values(
        SEED_ARTIFACTS.map((a) => {
          const versions = a.versions.map((v, i) => ({
            version: i + 1,
            at: new Date(now.getTime() - v.minutesAgo * MINUTE).toISOString(),
            note: v.note,
          }));
          const updatedAt = new Date(versions.at(-1)!.at);
          return {
            ownerId: userId,
            id: a.id,
            name: a.name,
            kind: a.body.kind,
            sensitivity: a.sensitivity,
            chatId: a.chatId,
            project: a.project,
            sharedWith: a.sharedWith,
            versions,
            sources: a.sources,
            body: a.body,
            createdAt: new Date(versions[0]!.at),
            updatedAt,
          };
        }),
      );
    });
  }

  /** Runs `seed` in the same transaction that claims the set, so two first requests at once seed it once. */
  private once(userId: string, name: string, seed: (tx: Tx) => Promise<void>): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const claimed = await tx.insert(userSeeds).values({ userId, name }).onConflictDoNothing().returning();
      if (claimed.length > 0) await seed(tx);
      return claimed.length > 0;
    });
  }
}
