import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { SearchQuery, SearchResults } from '@donovan/contracts';
import { Controller, Get, Inject, Logger, Query } from '@nestjs/common';
import { and, desc, eq, ilike, inArray, isNull } from 'drizzle-orm';
import { ArtifactsService } from '../artifacts/artifacts.service.js';
import { Claims } from '../auth/claims.decorator.js';
import type { Claims as TokenClaims } from '../auth/claims.js';
import { ChatsService } from '../chats/chats.service.js';
import { DB, type Db } from '../db/db.module.js';
import { chats, projects } from '../db/schema.js';
import { ChatSearch } from '../search/chat-search.js';
import { SeedService } from '../seed/seed.service.js';
import { UsersService } from '../users/users.service.js';

/** ⌘K: one query across the person's chats, artifacts and projects. */
@ApiTags('Search')
@ApiBearerAuth()
@Controller('search')
export class SearchController {
  readonly #log = new Logger(SearchController.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly users: UsersService,
    private readonly chatsService: ChatsService,
    private readonly chatSearch: ChatSearch,
    private readonly artifacts: ArtifactsService,
    private readonly seeds: SeedService,
  ) {}

  @Get()
  @ApiOkResponse({ standardSchema: SearchResults })
  async search(
    @Claims() claims: TokenClaims,
    @Query({ schema: SearchQuery }) query: SearchQuery,
  ): Promise<SearchResults> {
    const userId = await this.users.idFor(claims);
    // A first visit seeds (and indexes) everything there is to find.
    await this.chatsService.list(userId);
    await this.seeds.ensureProjects(userId);
    const like = `%${query.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    const [chatHits, artifactHits, projectRows] = await Promise.all([
      this.findChats(userId, query.q, like),
      this.artifacts.list(userId, { q: query.q }),
      this.db
        .select()
        .from(projects)
        .where(and(eq(projects.ownerId, userId), ilike(projects.name, like)))
        .orderBy(desc(projects.updatedAt))
        .limit(5),
    ]);
    return {
      chats: chatHits,
      artifacts: artifactHits
        .slice(0, 6)
        .map((a) => ({ id: a.id, title: a.name, detail: `${a.kind} · ${a.chat?.title ?? 'Uploaded'}` })),
      projects: projectRows.map((p) => ({ id: p.id, title: p.name, detail: p.team })),
    };
  }

  /** Elasticsearch over titles and turns; if it's down, titles in Postgres. */
  private async findChats(userId: string, q: string, like: string): Promise<SearchResults['chats']> {
    try {
      const hits = await this.chatSearch.search(userId, q);
      // Nothing found may mean the index is behind (reconciliation catches it up): titles in Postgres meanwhile.
      if (hits.length === 0) return this.titleMatches(userId, like);
      const rows = await this.db
        .select({ id: chats.id, title: chats.title })
        .from(chats)
        .where(
          and(
            eq(chats.ownerId, userId),
            isNull(chats.archivedAt),
            inArray(
              chats.id,
              hits.map((h) => h.id),
            ),
          ),
        );
      return hits.flatMap((h) => {
        const row = rows.find((r) => r.id === h.id);
        return row ? [{ id: row.id, title: row.title, detail: h.snippet ?? 'Title matches' }] : [];
      });
    } catch (err) {
      this.#log.warn(`Chat search fell back to Postgres (${err instanceof Error ? err.name : 'error'})`);
      return this.titleMatches(userId, like);
    }
  }

  private async titleMatches(userId: string, like: string): Promise<SearchResults['chats']> {
    const rows = await this.db
      .select({ id: chats.id, title: chats.title })
      .from(chats)
      .where(and(eq(chats.ownerId, userId), isNull(chats.archivedAt), ilike(chats.title, like)))
      .limit(8);
    return rows.map((r) => ({ ...r, detail: 'Title matches' }));
  }
}
