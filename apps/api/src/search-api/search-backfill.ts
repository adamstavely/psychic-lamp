import { Client } from '@elastic/elasticsearch';
import { ConfigService } from '@nestjs/config';
import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { asc, isNull } from 'drizzle-orm';
import { ARTIFACT_INDEX, ArtifactSearch } from '../artifacts/artifact-search.js';
import { plainText } from '../artifacts/text.js';
import { ChatsService } from '../chats/chats.service.js';
import type { Env } from '../config/env.js';
import { DB, type Db } from '../db/db.module.js';
import { artifacts, chats } from '../db/schema.js';
import { CHAT_INDEX, ChatSearch, chatText } from '../search/chat-search.js';

/**
 * On start, indexes any chats and artifacts the search indexes don't have yet: data from before search existed, or
 * written while Elasticsearch was down. Runs in the background; the API answers meanwhile.
 */
@Injectable()
export class SearchBackfill implements OnApplicationBootstrap {
  readonly #log = new Logger(SearchBackfill.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly es: Client,
    private readonly chatSearch: ChatSearch,
    private readonly artifactSearch: ArtifactSearch,
    private readonly chatsService: ChatsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.get('SEARCH_BACKFILL', { infer: true })) return;
    void this.run().catch((err: unknown) => this.#log.warn(`Search backfill stopped: ${String(err)}`));
  }

  async run(): Promise<void> {
    const indexedChats = await this.ids(CHAT_INDEX);
    const chatRows = await this.db
      .select({ ownerId: chats.ownerId, id: chats.id })
      .from(chats)
      .where(isNull(chats.archivedAt))
      .orderBy(asc(chats.ownerId));
    const missingChats = chatRows.filter((c) => !indexedChats.has(`${c.ownerId}:${c.id}`));
    for (const c of missingChats) {
      const chat = await this.chatsService.get(c.ownerId, c.id);
      await this.chatSearch.index([{ ownerId: c.ownerId, id: c.id, title: chat.title, text: chatText(chat.messages) }]);
    }

    const indexedArtifacts = await this.ids(ARTIFACT_INDEX);
    const artifactRows = await this.db.select().from(artifacts);
    const missingArtifacts = artifactRows.filter((a) => !indexedArtifacts.has(`${a.ownerId}:${a.id}`));
    if (missingArtifacts.length)
      await this.artifactSearch.index(
        missingArtifacts.map((a) => ({
          ownerId: a.ownerId,
          id: a.id,
          name: a.name,
          kind: a.kind,
          text: plainText(a.body),
        })),
      );
    if (missingChats.length || missingArtifacts.length)
      this.#log.log(`Indexed ${missingChats.length} chats and ${missingArtifacts.length} artifacts for search`);
  }

  /** Every document id in an index (fine at this size; a scroll would replace it at scale). */
  private async ids(index: string): Promise<Set<string>> {
    const res = await this.es.search({
      index,
      size: 10_000,
      _source: false,
      query: { match_all: {} },
      ignore_unavailable: true,
    });
    return new Set(res.hits.hits.map((h) => h._id!));
  }
}
