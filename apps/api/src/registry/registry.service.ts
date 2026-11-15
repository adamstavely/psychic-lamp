import {
  RegistryItem,
  RegistryKind,
  Sensitivity,
  type AttachResult,
  type CollectionAttachment,
  type InstallClient,
  type RegistryCounts,
  type RegistryInstall,
  type SpaceRunResult,
  type TryResult,
  type RegistryQuery,
  type RegistrySummary,
} from '@donovan/contracts';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { and, asc, count, eq, inArray, isNotNull, or, sql, type SQL } from 'drizzle-orm';
import { DB, type Db } from '../db/db.module.js';
import { projectCollections, projects, registryInstalls, registryItems } from '../db/schema.js';
import { cardFor, type CardInput } from './registry-card.js';
import { REGISTRY_SEED } from './registry.fixture.js';
import { missingArgs, mockToolResult } from './registry-try.js';

/** What can be installed in a client: servers (as MCP config) and skills (into a skill index). */
const INSTALLABLE: readonly RegistryKind[] = ['server', 'skill'];
import { RegistrySearch, registryDocId, type RegistryDoc } from './registry-search.js';

type Row = typeof registryItems.$inferSelect;

/**
 * Build mode's registry. What a person may see: everything published, and everything waiting for review (anyone but
 * its submitter may review it, so anyone may see it); drafts, items sent back for changes and rejected items only by
 * their owner.
 */
@Injectable()
export class RegistryService implements OnApplicationBootstrap {
  readonly #log = new Logger(RegistryService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly search: RegistrySearch,
  ) {}

  /**
   * Writes the starting catalog into an empty registry. Only an empty one: an item someone removes later doesn't come
   * back on the next start. Two instances starting together both insert, and the second's rows are skipped.
   */
  async onApplicationBootstrap(): Promise<void> {
    const [{ n }] = await this.db.select({ n: count() }).from(registryItems);
    if (n > 0) return;
    const rows = await this.db
      .insert(registryItems)
      .values(
        REGISTRY_SEED.map((item) => ({
          kind: item.kind,
          id: item.id,
          name: item.name,
          slug: item.slug,
          version: item.version,
          sensitivity: item.sensitivity,
          summary: item.summary,
          ownerTeam: item.owner.team,
          ownerId: null,
          ownerName: item.owner.name,
          status: item.status,
          details: item.details,
        })),
      )
      .onConflictDoNothing()
      .returning();
    await this.indexQuietly(rows);
  }

  async list(userId: string, query: RegistryQuery): Promise<RegistrySummary[]> {
    const where = and(
      this.visibleTo(userId),
      query.kind ? eq(registryItems.kind, query.kind) : undefined,
      scopeOf(userId, query.scope),
    );
    if (!query.q) {
      const rows = await this.db.select().from(registryItems).where(where).orderBy(asc(registryItems.name));
      return rows.map(toSummary);
    }
    const ranked = await this.matching(query.q, query.kind);
    if (ranked.length === 0) return [];
    const rows = await this.db
      .select()
      .from(registryItems)
      .where(and(where, inArray(sql`${registryItems.kind} || ':' || ${registryItems.id}`, ranked)));
    const rank = new Map(ranked.map((key, i) => [key, i]));
    return rows
      .sort((a, b) => rank.get(registryDocId(a.kind, a.id))! - rank.get(registryDocId(b.kind, b.id))!)
      .map(toSummary);
  }

  async get(userId: string, kind: RegistryKind, id: string): Promise<RegistryItem> {
    const [row] = await this.db
      .select()
      .from(registryItems)
      .where(and(eq(registryItems.kind, kind), eq(registryItems.id, id), this.visibleTo(userId)));
    // Something the person can't see answers like something that doesn't exist.
    if (!row) throw new NotFoundException(`No ${kind} with that id`);
    return toItem(row);
  }

  /** Runs one of a server's tools in the sandbox: a mock response, nothing called. */
  async tryTool(userId: string, serverId: string, toolName: string, args: Record<string, string>): Promise<TryResult> {
    const server = await this.get(userId, 'server', serverId);
    if (server.kind !== 'server') throw new NotFoundException('No server with that id');
    const tool = server.details.tools.find((t) => t.name === toolName);
    if (!tool) throw new NotFoundException(`${server.name} has no tool called ${toolName}`);
    const missing = missingArgs(tool, args);
    if (missing.length) throw new BadRequestException(`Fill in ${missing.join(', ')}`);
    return { status: '200 OK', durationMs: 400, result: mockToolResult(tool, args) };
  }

  /** Runs a space on what the person gave it: simulated, so its model's usual answer comes back. */
  async runSpace(userId: string, id: string, _input: string): Promise<SpaceRunResult> {
    const space = await this.get(userId, 'space', id);
    if (space.kind !== 'space') throw new NotFoundException('No space with that id');
    return { status: '200 OK', durationMs: 400, outputs: space.details.outputs };
  }

  /** The person's projects a collection is attached to, oldest first. */
  async attachments(userId: string, collectionId: string): Promise<CollectionAttachment[]> {
    await this.get(userId, 'collection', collectionId);
    const rows = await this.db
      .select({ projectId: projectCollections.projectId, project: projects.name, at: projectCollections.createdAt })
      .from(projectCollections)
      .innerJoin(
        projects,
        and(eq(projects.ownerId, projectCollections.ownerId), eq(projects.id, projectCollections.projectId)),
      )
      .where(and(eq(projectCollections.ownerId, userId), eq(projectCollections.collectionId, collectionId)))
      .orderBy(asc(projectCollections.createdAt));
    return rows.map((r) => ({ projectId: r.projectId, project: r.project, at: r.at.toISOString() }));
  }

  /**
   * Attaches a collection to one of the person's projects. A collection is as sensitive as its most sensitive member,
   * and attaching applies that tier to the project: a project below it is raised to it (and the result says so).
   */
  async attach(userId: string, collectionId: string, projectId: string): Promise<AttachResult> {
    const collection = await this.get(userId, 'collection', collectionId);
    if (collection.status !== 'published') throw new BadRequestException('Only published collections can be attached');
    const raised = await this.db.transaction(async (tx) => {
      const [project] = await tx
        .select({ sensitivity: projects.sensitivity })
        .from(projects)
        .where(and(eq(projects.ownerId, userId), eq(projects.id, projectId)))
        .for('update');
      if (!project) throw new BadRequestException("That isn't one of your projects");
      await tx.insert(projectCollections).values({ ownerId: userId, projectId, collectionId }).onConflictDoNothing();
      const rank = (s: Sensitivity) => Sensitivity.options.indexOf(s);
      if (rank(project.sensitivity) >= rank(collection.sensitivity)) return null;
      await tx
        .update(projects)
        .set({ sensitivity: collection.sensitivity, updatedAt: new Date() })
        .where(and(eq(projects.ownerId, userId), eq(projects.id, projectId)));
      return { from: project.sensitivity, to: collection.sensitivity };
    });
    return { attachments: await this.attachments(userId, collectionId), raised };
  }

  /** Takes a collection off a project. The project keeps its tier: lowering it is the owner's call. */
  async detach(userId: string, collectionId: string, projectId: string): Promise<CollectionAttachment[]> {
    await this.db
      .delete(projectCollections)
      .where(
        and(
          eq(projectCollections.ownerId, userId),
          eq(projectCollections.projectId, projectId),
          eq(projectCollections.collectionId, collectionId),
        ),
      );
    return this.attachments(userId, collectionId);
  }

  /** Where the person has installed an item, oldest first. */
  async installs(userId: string, kind: RegistryKind, id: string): Promise<RegistryInstall[]> {
    await this.get(userId, kind, id);
    const rows = await this.db
      .select()
      .from(registryInstalls)
      .where(
        and(eq(registryInstalls.ownerId, userId), eq(registryInstalls.kind, kind), eq(registryInstalls.itemId, id)),
      )
      .orderBy(asc(registryInstalls.createdAt));
    return rows.map((r) => ({ client: r.client, at: r.createdAt.toISOString() }));
  }

  /** Records an install in a client; installing again in the same client changes nothing. */
  async install(userId: string, kind: RegistryKind, id: string, client: InstallClient): Promise<RegistryInstall[]> {
    if (!INSTALLABLE.includes(kind)) throw new BadRequestException(`A ${kind} isn't installed in a client`);
    const item = await this.get(userId, kind, id);
    if (item.status !== 'published') throw new BadRequestException('Only published items can be installed');
    await this.db.insert(registryInstalls).values({ ownerId: userId, kind, itemId: id, client }).onConflictDoNothing();
    return this.installs(userId, kind, id);
  }

  async uninstall(userId: string, kind: RegistryKind, id: string, client: InstallClient): Promise<RegistryInstall[]> {
    await this.db
      .delete(registryInstalls)
      .where(
        and(
          eq(registryInstalls.ownerId, userId),
          eq(registryInstalls.kind, kind),
          eq(registryInstalls.itemId, id),
          eq(registryInstalls.client, client),
        ),
      );
    return this.installs(userId, kind, id);
  }

  /** How many items of each kind the person can see. */
  async counts(userId: string): Promise<RegistryCounts> {
    const rows = await this.db
      .select({ kind: registryItems.kind, n: count() })
      .from(registryItems)
      .where(this.visibleTo(userId))
      .groupBy(registryItems.kind);
    const out = Object.fromEntries(RegistryKind.options.map((k) => [k, 0])) as RegistryCounts;
    for (const r of rows) out[r.kind] = r.n;
    return out;
  }

  private visibleTo(userId: string): SQL {
    return or(inArray(registryItems.status, ['published', 'pending']), eq(registryItems.ownerId, userId))!;
  }

  /**
   * Keys (kind:id) of the items that match, best first: the search index's ranking, then anything Postgres finds by
   * plain text that the index didn't (an entry missing or behind, until reconciliation repairs it), so a stale index
   * never hides a match. Postgres alone when the index is down.
   */
  private async matching(q: string, kind?: RegistryKind): Promise<string[]> {
    let ranked: string[] = [];
    try {
      ranked = await this.search.search(q, kind);
    } catch (err) {
      this.#log.warn(`Registry search fell back to Postgres (${err instanceof Error ? err.name : 'error'})`);
    }
    const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    const rows = await this.db
      .select({ kind: registryItems.kind, id: registryItems.id })
      .from(registryItems)
      .where(
        and(
          kind ? eq(registryItems.kind, kind) : undefined,
          or(
            sql`${registryItems.name} ilike ${like}`,
            sql`${registryItems.slug} ilike ${like}`,
            sql`${registryItems.summary} ilike ${like}`,
            sql`${registryItems.details}::text ilike ${like}`,
          ),
        ),
      )
      .orderBy(asc(registryItems.name));
    const seen = new Set(ranked);
    return [...ranked, ...rows.map((r) => registryDocId(r.kind, r.id)).filter((key) => !seen.has(key))];
  }

  private async indexQuietly(rows: Row[]): Promise<void> {
    try {
      await this.search.index(rows.map(toDoc));
    } catch (err) {
      this.#log.warn(
        `Couldn't index registry items (${err instanceof Error ? err.name : 'error'}); reconciliation will retry`,
      );
    }
  }
}

function scopeOf(userId: string, scope: RegistryQuery['scope']): SQL | undefined {
  if (scope === 'mine') return eq(registryItems.ownerId, userId);
  if (scope === 'team') return isNotNull(registryItems.ownerTeam);
  return undefined;
}

function toSummary(r: Row): RegistrySummary {
  return {
    kind: r.kind,
    id: r.id,
    name: r.name,
    slug: r.slug,
    version: r.version,
    sensitivity: r.sensitivity,
    summary: r.summary,
    owner: { team: r.ownerTeam, personId: r.ownerId, name: r.ownerName },
    status: r.status,
    updatedAt: r.updatedAt.toISOString(),
    // A row's details belong to its kind (checked on the way in), which the table's types can't say.
    card: cardFor({
      kind: r.kind,
      details: r.details,
      slug: r.slug,
      version: r.version,
      status: r.status,
    } as CardInput),
  };
}

/** The row as the contract has it; a row whose details don't fit its kind is a bug, so it fails loudly here. */
function toItem(r: Row): RegistryItem {
  return RegistryItem.parse({ ...toSummary(r), details: r.details });
}

/** The words in an item's details, for search: every string in them, joined. */
export function detailText(details: unknown): string {
  const words: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === 'string') words.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(details);
  return words.join(' ').slice(0, 50_000);
}

export function toDoc(r: Row): RegistryDoc {
  return {
    kind: r.kind,
    id: r.id,
    name: r.name,
    slug: r.slug,
    summary: r.summary,
    text: detailText(r.details),
    version: r.searchVersion,
  };
}
