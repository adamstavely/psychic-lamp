import { Client } from '@elastic/elasticsearch';
import { ConfigService } from '@nestjs/config';
import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { ARTIFACT_INDEX, ArtifactSearch } from '../artifacts/artifact-search.js';
import { plainText } from '../artifacts/text.js';
import { ChatsService } from '../chats/chats.service.js';
import type { Env } from '../config/env.js';
import { DB, type Db } from '../db/db.module.js';
import { artifacts, chats, registryItems } from '../db/schema.js';
import { REGISTRY_INDEX, RegistrySearch, registryDocId } from '../registry/registry-search.js';
import { toDoc } from '../registry/registry.service.js';
import { CHAT_INDEX, ChatSearch, chatText } from '../search/chat-search.js';

/** At most this many documents are rebuilt in one pass, so a pass stays bounded; the next pass takes the rest. */
const PER_PASS = 500;

export interface ReconcileReport {
  chats: { indexed: number; removed: number };
  artifacts: { indexed: number; removed: number };
  registry: { indexed: number; removed: number };
}

/**
 * Keeps the search indexes in step with Postgres, which stays the record. On start and then every
 * SEARCH_RECONCILE_MINUTES it compares each index with the database: documents that are missing, or older than the row
 * (by the version each one records), are rebuilt; documents for chats and artifacts that are gone or deleted are
 * removed. So an update that failed, or was missed while Elasticsearch was down, is repaired within one interval.
 */
@Injectable()
export class SearchBackfill implements OnApplicationBootstrap, OnApplicationShutdown {
  readonly #log = new Logger('SearchReconcile');
  #timer: NodeJS.Timeout | undefined;
  #running = false;

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly es: Client,
    private readonly chatSearch: ChatSearch,
    private readonly artifactSearch: ArtifactSearch,
    private readonly registrySearch: RegistrySearch,
    private readonly chatsService: ChatsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.get('SEARCH_BACKFILL', { infer: true })) return;
    const pass = () =>
      void this.run().catch((err: unknown) => this.#log.warn(`Search reconciliation stopped: ${errorName(err)}`));
    pass();
    const minutes = this.config.get('SEARCH_RECONCILE_MINUTES', { infer: true });
    if (minutes > 0) this.#timer = setInterval(pass, minutes * 60_000).unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.#timer);
  }

  /** One pass. Passes don't overlap: one that starts while another runs does nothing. */
  async run(): Promise<ReconcileReport> {
    const report: ReconcileReport = {
      chats: { indexed: 0, removed: 0 },
      artifacts: { indexed: 0, removed: 0 },
      registry: { indexed: 0, removed: 0 },
    };
    if (this.#running) return report;
    this.#running = true;
    try {
      report.chats = await this.reconcileChats();
      report.artifacts = await this.reconcileArtifacts();
      report.registry = await this.reconcileRegistry();
      const { chats: c, artifacts: a, registry: r } = report;
      if (c.indexed || c.removed || a.indexed || a.removed || r.indexed || r.removed)
        this.#log.log(
          `Search reconciled: ${c.indexed} chats, ${a.indexed} artifacts and ${r.indexed} registry items re-indexed, ` +
            `${c.removed} chats, ${a.removed} artifacts and ${r.removed} registry items removed`,
        );
      return report;
    } finally {
      this.#running = false;
    }
  }

  private async reconcileChats(): Promise<{ indexed: number; removed: number }> {
    const indexed = await this.versions(CHAT_INDEX);
    const rows = await this.db
      .select({ ownerId: chats.ownerId, id: chats.id, version: chats.searchVersion })
      .from(chats)
      .where(isNull(chats.archivedAt));
    const live = new Set(rows.map((r) => `${r.ownerId}:${r.id}`));
    const behind = rows.filter((r) => (indexed.get(`${r.ownerId}:${r.id}`) ?? -1) < r.version).slice(0, PER_PASS);
    for (const r of behind) {
      const chat = await this.chatsService.get(r.ownerId, r.id);
      // The version read before the content: an edit made meanwhile leaves this entry behind, for the next pass.
      await this.chatSearch.index([
        { ownerId: r.ownerId, id: r.id, title: chat.title, text: chatText(chat.messages), version: r.version },
      ]);
    }
    const gone = [...indexed.keys()].filter((id) => !live.has(id));
    await this.remove(CHAT_INDEX, gone);
    return { indexed: behind.length, removed: gone.length };
  }

  private async reconcileArtifacts(): Promise<{ indexed: number; removed: number }> {
    const indexed = await this.versions(ARTIFACT_INDEX);
    const rows = await this.db.select().from(artifacts);
    const live = new Set(rows.map((r) => `${r.ownerId}:${r.id}`));
    const behind = rows
      .filter((r) => (indexed.get(`${r.ownerId}:${r.id}`) ?? -1) < r.updatedAt.getTime())
      .slice(0, PER_PASS);
    if (behind.length)
      await this.artifactSearch.index(
        behind.map((a) => ({
          ownerId: a.ownerId,
          id: a.id,
          name: a.name,
          kind: a.kind,
          text: plainText(a.body),
          version: a.updatedAt.getTime(),
        })),
      );
    const gone = [...indexed.keys()].filter((id) => !live.has(id));
    await this.remove(ARTIFACT_INDEX, gone);
    return { indexed: behind.length, removed: gone.length };
  }

  private async reconcileRegistry(): Promise<{ indexed: number; removed: number }> {
    const indexed = await this.versions(REGISTRY_INDEX);
    const rows = await this.db
      .select({ kind: registryItems.kind, id: registryItems.id, version: registryItems.searchVersion })
      .from(registryItems);
    const live = new Set(rows.map((r) => registryDocId(r.kind, r.id)));
    const behind = rows.filter((r) => (indexed.get(registryDocId(r.kind, r.id)) ?? -1) < r.version).slice(0, PER_PASS);
    for (const r of behind) {
      const [row] = await this.db
        .select()
        .from(registryItems)
        .where(and(eq(registryItems.kind, r.kind), eq(registryItems.id, r.id)));
      // Filed under the version read before the content, as for chats: a change meanwhile leaves it behind.
      if (row) await this.registrySearch.index([{ ...toDoc(row), version: r.version }]);
    }
    const gone = [...indexed.keys()].filter((id) => !live.has(id));
    await this.remove(REGISTRY_INDEX, gone);
    return { indexed: behind.length, removed: gone.length };
  }

  /**
   * Every document in an index with the version it was built from (0 for documents from before versions). A
   * point-in-time search pages through the whole index, however large.
   */
  private async versions(index: string): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (!(await this.es.indices.exists({ index }))) return out;
    const pit = await this.es.openPointInTime({ index, keep_alive: '1m' });
    try {
      let after: (string | number)[] | undefined;
      for (;;) {
        const res = await this.es.search<{ version?: number }>({
          size: 1000,
          _source: ['version'],
          pit: { id: pit.id, keep_alive: '1m' },
          sort: [{ _shard_doc: 'asc' }],
          ...(after ? { search_after: after } : {}),
        });
        for (const h of res.hits.hits) out.set(h._id!, h._source?.version ?? 0);
        if (res.hits.hits.length < 1000) break;
        after = res.hits.hits.at(-1)!.sort as (string | number)[];
      }
    } finally {
      await this.es.closePointInTime({ id: pit.id }).catch(() => undefined);
    }
    return out;
  }

  private async remove(index: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.es.bulk({ refresh: true, operations: ids.map((id) => ({ delete: { _index: index, _id: id } })) });
  }
}

function errorName(err: unknown): string {
  return err instanceof Error ? err.name : 'error';
}
