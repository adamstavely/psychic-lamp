import { Inject, Injectable } from '@nestjs/common';
import { DB, type Db } from '../db/db.module.js';
import { chats, messages, userSeeds } from '../db/schema.js';
import { SEED_CHATS } from './chats.fixture.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const MINUTE = 60_000;

/** Copies the canned content to a person the first time they need it, once per set, safely under concurrency. */
@Injectable()
export class SeedService {
  constructor(@Inject(DB) private readonly db: Db) {}

  ensureChats(userId: string, now = new Date()): Promise<void> {
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

  /** Runs `seed` in the same transaction that claims the set, so two first requests at once seed it once. */
  private async once(userId: string, name: string, seed: (tx: Tx) => Promise<void>): Promise<void> {
    await this.db.transaction(async (tx) => {
      const claimed = await tx.insert(userSeeds).values({ userId, name }).onConflictDoNothing().returning();
      if (claimed.length > 0) await seed(tx);
    });
  }
}
