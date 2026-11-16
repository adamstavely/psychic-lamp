import {
  RegistryItem,
  RegistryKind,
  Sensitivity,
  type AttachResult,
  type CollectionAttachment,
  type InstallClient,
  type NewRegistryItem,
  type WorkflowBindings,
  type WorkflowGraph,
  type RegistryCounts,
  type RegistryInstall,
  type SpaceRunResult,
  type TryResult,
  type RegistryQuery,
  type RegistryRef,
  type RegistrySummary,
} from '@donovan/contracts';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { and, asc, count, eq, inArray, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';
import { DB, type Db } from '../db/db.module.js';

/** A transaction on the database, as `db.transaction` hands it over. */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
import { GovernanceService } from '../governance/governance.service.js';
import { projectCollections, projects, registryInstalls, registryItems } from '../db/schema.js';
import { authorOf, proposed, seenBy, toSummary, type Viewer } from './registry-row.js';
import { REGISTRY_SEED } from './registry.fixture.js';
import { detailsFor, slugify } from './registration.js';
import { checkWorkflow } from '@donovan/contracts/defaults';
import { missingArgs, mockToolResult } from './registry-try.js';

/** What can be installed in a client: servers (as MCP config) and skills (into a skill index). */
const INSTALLABLE: readonly RegistryKind[] = ['server', 'skill'];
import { RegistrySearch, registryDocId, type RegistryDoc } from './registry-search.js';

type Row = typeof registryItems.$inferSelect;
/** An item another links to, as the registry has it. */
interface Linked {
  kind: RegistryKind;
  id: string;
  name: string;
  sensitivity: Sensitivity;
}

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
    private readonly governance: GovernanceService,
  ) {}

  /**
   * Writes the starting catalog into an empty registry. Only an empty one: an item someone removes later doesn't come
   * back on the next start. Two instances starting together both insert, and the second's rows are skipped.
   */
  async onApplicationBootstrap(): Promise<void> {
    const [{ n }] = await this.db.select({ n: count() }).from(registryItems);
    if (n > 0) {
      await this.repairSeededWorkflows();
      await this.repairLinks();
      return;
    }
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

  /**
   * Earlier seeds had two workflows with no steps and summaries that only repeated their step count. Workflows still as
   * seeded (a team's, never edited: no submitter) get the current seed's graph and summary.
   */
  private async repairSeededWorkflows(): Promise<void> {
    for (const seed of REGISTRY_SEED) {
      // The seed's type is a union Omit flattens, so the kind doesn't narrow its details here.
      if (seed.kind !== 'workflow' || !(seed.details as { nodes: unknown[] }).nodes.length) continue;
      await this.db
        .update(registryItems)
        .set({
          summary: seed.summary,
          details: seed.details,
          revision: sql`${registryItems.revision} + 1`,
          searchVersion: sql`${registryItems.searchVersion} + 1`,
        })
        .where(
          and(
            eq(registryItems.kind, 'workflow'),
            eq(registryItems.id, seed.id),
            isNull(registryItems.ownerId),
            isNull(registryItems.submittedBy),
            sql`(jsonb_array_length(${registryItems.details}->'nodes') = 0 or ${registryItems.summary} ~ '^[0-9]+ steps · ')`,
          ),
        );
    }
  }

  /**
   * Earlier registries linked an agent's servers and skills, a dataset's models and a collection's members by name.
   * Those become links by id, to the item of that kind with that name (a dataset's "Fraud Sentinel v3.2" is Fraud
   * Sentinel); a name nothing has is dropped. Items the seed has gained since (Churn Propensity, which the seeded
   * links name) are added first, once, with that change.
   */
  private async repairLinks(): Promise<void> {
    const linking: RegistryKind[] = ['agent', 'dataset', 'collection'];
    const rows = await this.db.select().from(registryItems).where(inArray(registryItems.kind, linking));
    const named = (v: unknown) => typeof v === 'string' || (typeof v === 'object' && v !== null && !('id' in v));
    const stale = rows.filter((r) => {
      const d = r.details as Record<string, unknown[] | undefined>;
      return [d['servers'], d['skills'], d['usedBy'], d['members']].some((list) => list?.some(named));
    });
    if (!stale.length) return;
    const added = REGISTRY_SEED.filter((i) => i.kind === 'model' && i.id === 'churn');
    const changed = await this.db
      .insert(registryItems)
      .values(
        added.map((item) => ({
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
    const all = await this.db
      .select({ kind: registryItems.kind, id: registryItems.id, name: registryItems.name })
      .from(registryItems);
    const resolve = (kind: RegistryKind, v: unknown): RegistryRef | null => {
      if (!named(v)) return v as RegistryRef;
      const name = typeof v === 'string' ? v : String((v as { name?: unknown }).name ?? '');
      const bare = name.replace(/\s+v\d[\w.]*$/, '');
      const found = all.find((i) => i.kind === kind && (i.name === name || i.name === bare));
      return found ? { id: found.id, name: found.name } : null;
    };
    const refs = (kind: RegistryKind, list: unknown[] = []) =>
      list.map((v) => resolve(kind, v)).filter((r): r is RegistryRef => r !== null);
    for (const row of stale) {
      const d = row.details as Record<string, unknown[]>;
      const details =
        row.kind === 'agent'
          ? { ...d, servers: refs('server', d['servers']), skills: refs('skill', d['skills']) }
          : row.kind === 'dataset'
            ? { ...d, usedBy: refs('model', d['usedBy']) }
            : {
                ...d,
                members: (d['members'] as { kind: RegistryKind }[])
                  .map((m) => {
                    const r = resolve(m.kind, m);
                    return r && { kind: m.kind, ...r };
                  })
                  .filter((m) => m !== null),
              };
      const [updated] = await this.db
        .update(registryItems)
        .set({
          details: details as Row['details'],
          revision: sql`${registryItems.revision} + 1`,
          searchVersion: sql`${registryItems.searchVersion} + 1`,
        })
        .where(and(eq(registryItems.kind, row.kind), eq(registryItems.id, row.id)))
        .returning();
      if (updated) changed.push(updated);
    }
    await this.indexQuietly(changed);
    this.#log.log(`Linked ${stale.length} registry items by id instead of by name`);
  }

  /** What a workflow step can call: published server tools ("Server · tool", "(write)" when it changes things), models and skills. */
  async workflowBindings(userId: string): Promise<WorkflowBindings> {
    const rows = await this.db
      .select()
      .from(registryItems)
      .where(
        and(
          eq(registryItems.status, 'published'),
          inArray(registryItems.kind, ['server', 'model', 'skill']),
          this.visibleTo(userId),
        ),
      )
      .orderBy(asc(registryItems.name));
    const out: WorkflowBindings = { Tool: [], Model: [], Skill: [] };
    for (const r of rows.map((row) => toItem(row, null))) {
      if (r.kind === 'server')
        out.Tool.push(...r.details.tools.map((t) => `${r.name} · ${t.name}${t.write ? ' (write)' : ''}`));
      else if (r.kind === 'model') out.Model.push(`${r.name} ${r.version}`);
      else if (r.kind === 'skill') out.Skill.push(`${r.name} ${r.version}`);
    }
    return out;
  }

  async list(userId: string, query: RegistryQuery): Promise<RegistrySummary[]> {
    const where = and(
      this.visibleTo(userId),
      query.kind ? eq(registryItems.kind, query.kind) : undefined,
      scopeOf(userId, query.scope),
    );
    if (!query.q) {
      const rows = await this.db.select().from(registryItems).where(where).orderBy(asc(registryItems.name));
      return rows.map((r) => toSummary(r, userId));
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
      .map((r) => toSummary(r, userId));
  }

  async get(userId: string, kind: RegistryKind, id: string): Promise<RegistryItem> {
    const [row] = await this.db
      .select()
      .from(registryItems)
      .where(and(eq(registryItems.kind, kind), eq(registryItems.id, id), this.visibleTo(userId)));
    // Something the person can't see answers like something that doesn't exist.
    if (!row) throw new NotFoundException(`No ${kind} with that id`);
    return toItem(row, userId);
  }

  /**
   * An edit of a published item, as reviewers judge it. Anyone may see it while it's waiting for review (as they may any
   * submission); its author may whatever its state. The item's own page shows everyone else the published version.
   */
  async proposed(userId: string, kind: RegistryKind, id: string): Promise<RegistryItem> {
    const [row] = await this.db
      .select()
      .from(registryItems)
      .where(and(eq(registryItems.kind, kind), eq(registryItems.id, id), this.visibleTo(userId)));
    const p = row?.proposal;
    if (!row || !p || !(p.status === 'pending' || authorOf(row, userId)))
      throw new NotFoundException(`No edit of that ${kind} is waiting for review`);
    return toItem(row, 'review');
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

  /**
   * Registers an item for review: it's saved as pending, owned by the person (for their team, if they named one), and
   * shows in their Mine with its status. Nothing is published until two other people approve it (step 8). An agent's
   * servers and skills and a collection's members must be in the registry; a collection is at least as sensitive as
   * its most sensitive member.
   */
  async register(userId: string, ownerName: string, body: NewRegistryItem): Promise<RegistryItem> {
    let sensitivity = body.sensitivity;
    let linked: Linked[] = [];
    if (body.kind === 'agent') {
      if (!body.servers.length && !body.skills.length)
        throw new BadRequestException('An agent needs at least one server or skill.');
      linked = await this.requireLinked(userId, [
        ...body.servers.map((id) => ({ kind: 'server' as const, id })),
        ...body.skills.map((id) => ({ kind: 'skill' as const, id })),
      ]);
    }
    if (body.kind === 'collection') {
      linked = await this.requireLinked(userId, body.members);
      const rank = (s: Sensitivity) => Sensitivity.options.indexOf(s);
      for (const m of linked) if (rank(m.sensitivity) > rank(sensitivity)) sensitivity = m.sensitivity;
    }
    const base = slugify(body.name);
    const slug = `${slugify(body.team ?? ownerName)}/${base}`;
    // Read before the lock: it's a policy lookup, not part of choosing the id.
    const readOnly = await this.governance.enabled('read-only-default');
    const row = await this.allocating(body.kind, async (tx) => {
      const [taken] = await tx
        .select({ id: registryItems.id })
        .from(registryItems)
        .where(and(eq(registryItems.kind, body.kind), eq(registryItems.slug, slug)));
      if (taken) throw new ConflictException(`There's already a ${body.kind} called ${slug}`);
      // Ids are unique per kind; a name someone else used gets a number.
      const id = await freeId(tx, body.kind, base);
      const [inserted] = await tx
        .insert(registryItems)
        .values({
          kind: body.kind,
          id,
          name: body.name,
          slug,
          version: 'v1',
          sensitivity,
          summary: body.summary,
          ownerTeam: body.team,
          ownerId: userId,
          ownerName: body.team ?? ownerName,
          status: 'pending',
          submittedBy: userId,
          // While the policy is on, everything starts read-only; an admin turns writes on later.
          access: readOnly ? { ...body.access, readOnly: true } : body.access,
          details: detailsFor(
            body,
            linked.map(({ kind, id, name }) => ({ kind, id, name })),
          ),
        })
        .returning();
      return inserted!;
    });
    await this.indexQuietly([row]);
    return toItem(row, userId);
  }

  /**
   * Runs a new item's id choice and insert one at a time per kind (a lock held until the transaction ends), so two
   * people registering the same name at once get "name" and "name-2" rather than one of them an error.
   */
  private allocating<T>(kind: RegistryKind, insert: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`registry-ids:${kind}`}))`);
      return insert(tx);
    });
  }

  /** Starts a workflow: a draft of the person's own, with no steps yet, to build on the canvas and then send to review. */
  async createWorkflow(userId: string, ownerName: string, requested: string): Promise<RegistryItem> {
    // A second "Untitled workflow" of the person's own is "Untitled workflow 2", not a conflict.
    const owner = slugify(ownerName);
    const row = await this.allocating('workflow', async (tx) => {
      const used = await tx
        .select({ slug: registryItems.slug })
        .from(registryItems)
        .where(and(eq(registryItems.kind, 'workflow'), sql`${registryItems.slug} like ${`${owner}/%`}`));
      const slugs = new Set(used.map((u) => u.slug));
      let name = requested;
      for (let n = 2; slugs.has(`${owner}/${slugify(name)}`); n++) name = `${requested} ${n}`;
      const base = slugify(name);
      const id = await freeId(tx, 'workflow', base);
      const [inserted] = await tx
        .insert(registryItems)
        .values({
          kind: 'workflow',
          id,
          name,
          slug: `${owner}/${base}`,
          version: 'v1',
          sensitivity: 'Internal',
          summary: '',
          ownerTeam: null,
          ownerId: userId,
          ownerName,
          status: 'draft',
          access: null,
          details: { state: 'Draft', schedule: 'not scheduled', nodes: [], edges: [] },
        })
        .returning();
      return inserted!;
    });
    return toItem(row, userId);
  }

  /**
   * Saves a workflow's graph as its next version and sends it to review. Its owner can edit their own; a team's
   * workflow can be edited by anyone, who becomes its submitter (and so can't review it). Blocking checks refuse it.
   * The save names the revision the editor started from and takes the row's lock: if someone saved since, it's refused
   * (409) rather than written over theirs, so each accepted save gets its own version.
   *
   * An edit of a published workflow doesn't replace it: it's kept as the workflow's proposal, and the published version
   * stays what everyone else sees and runs until two approvals promote the edit. One edit at a time: while someone's is
   * in review or sent back to them, nobody else can start another (a rejected one can be replaced).
   */
  async saveWorkflow(userId: string, id: string, body: WorkflowGraph): Promise<RegistryItem> {
    await this.get(userId, 'workflow', id);
    const blocking = checkWorkflow(body).filter((c) => c.level === 'block');
    if (blocking.length) throw new BadRequestException(blocking.map((c) => c.message).join(' '));
    const result = await this.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(registryItems)
        .where(and(eq(registryItems.kind, 'workflow'), eq(registryItems.id, id)))
        .for('update');
      const row = current!;
      if (row.ownerId && row.ownerId !== userId)
        throw new ForbiddenException("Only its owner can change someone's own workflow");
      const p = row.proposal;
      const theirs = !!p && authorOf(row, userId);
      if (p && !theirs && p.status !== 'rejected')
        throw new ConflictException(
          p.status === 'pending'
            ? `${p.version} is in review: edit it once it's been decided.`
            : `${p.version} was sent back to its editor for changes: edit it once they've resubmitted it.`,
        );
      // What the editor had on screen: their own edit, or the published version.
      const base = theirs ? proposed(row) : row;
      if (base.revision !== body.revision)
        throw new ConflictException(
          `Someone saved ${base.version} while you were editing, so yours wasn't saved. Reload to see theirs.`,
        );
      const vn = (v: string) => Number(v.replace(/^v/, '')) || 1;
      const details = {
        ...(base.details as RegistryItem['details'] & object),
        state: row.status === 'draft' ? 'Active' : (base.details as { state: string }).state,
        nodes: body.nodes,
        edges: body.edges,
      } as RegistryItem['details'];

      if (row.status === 'published') {
        const [saved] = await tx
          .update(registryItems)
          .set({
            proposal: {
              // Revisions and versions are never reused, so a replaced rejected edit's snapshot keeps its own.
              revision: Math.max(row.revision, p?.revision ?? 0) + 1,
              version: `v${Math.max(vn(row.version), p ? vn(p.version) : 0) + 1}`,
              name: body.name,
              summary: base.summary,
              sensitivity: body.sensitivity,
              details,
              status: 'pending',
              at: new Date().toISOString(),
            },
            submittedBy: userId,
            reviewRound: sql`${registryItems.reviewRound} + 1`,
          })
          .where(and(eq(registryItems.kind, 'workflow'), eq(registryItems.id, id)))
          .returning();
        // The published version is unchanged, so search has nothing new to index.
        return { saved: saved!, index: false };
      }

      const [saved] = await tx
        .update(registryItems)
        .set({
          name: body.name,
          sensitivity: body.sensitivity,
          version: row.status === 'draft' ? row.version : `v${vn(row.version) + 1}`,
          status: 'pending',
          submittedBy: userId,
          reviewRound:
            row.status === 'draft' ? sql`${registryItems.reviewRound}` : sql`${registryItems.reviewRound} + 1`,
          revision: sql`${registryItems.revision} + 1`,
          details,
          updatedAt: new Date(),
          searchVersion: sql`${registryItems.searchVersion} + 1`,
        })
        .where(and(eq(registryItems.kind, 'workflow'), eq(registryItems.id, id)))
        .returning();
      return { saved: saved!, index: true };
    });
    if (result.index) await this.indexQuietly([result.saved]);
    return toItem(result.saved, userId);
  }

  /** The linked items, which must all be in the registry and visible to the person: in the order given, each once. */
  private async requireLinked(userId: string, links: { kind: RegistryKind; id: string }[]): Promise<Linked[]> {
    if (links.length === 0) return [];
    const rows = await this.db
      .select({
        kind: registryItems.kind,
        id: registryItems.id,
        name: registryItems.name,
        sensitivity: registryItems.sensitivity,
      })
      .from(registryItems)
      .where(
        and(
          this.visibleTo(userId),
          inArray(
            registryItems.id,
            links.map((l) => l.id),
          ),
        ),
      );
    const found = links.map((l) => rows.find((r) => r.kind === l.kind && r.id === l.id));
    const missing = links.filter((_, i) => !found[i]).map((l) => `${l.kind} ${l.id}`);
    if (missing.length) throw new BadRequestException(`Not in the registry: ${missing.join(', ')}`);
    return [...new Map(found.map((r) => [`${r!.kind}:${r!.id}`, r!])).values()];
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
    const confidential = item.sensitivity === 'Confidential' || item.sensitivity === 'Restricted';
    if (confidential && client !== 'donovan-chat' && (await this.governance.enabled('confidential-in-workspace')))
      throw new BadRequestException(`${item.sensitivity} items stay in the workspace: install it in Donovan chat`);
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

  /**
   * What the person can see: anything published or in review, and, whatever its state, what they own or last sent to
   * review (a team's item they edited, sent back to them). Other people's drafts and returned submissions stay hidden;
   * so does someone else's edit of a published item, whose published version they see instead (see seenBy).
   */
  private visibleTo(userId: string): SQL {
    return or(
      inArray(registryItems.status, ['published', 'pending']),
      eq(registryItems.ownerId, userId),
      eq(registryItems.submittedBy, userId),
    )!;
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

/** The first of base, base-2, base-3… that no item of this kind has. */
async function freeId(tx: Tx, kind: RegistryKind, base: string): Promise<string> {
  const used = await tx
    .select({ id: registryItems.id })
    .from(registryItems)
    .where(and(eq(registryItems.kind, kind), sql`${registryItems.id} like ${`${base}%`}`));
  const ids = new Set(used.map((u) => u.id));
  let id = base;
  for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
  return id;
}

function scopeOf(userId: string, scope: RegistryQuery['scope']): SQL | undefined {
  // Mine is what the person owns or last sent to review, such as a team's workflow they edited.
  const mine = or(eq(registryItems.ownerId, userId), eq(registryItems.submittedBy, userId));
  if (scope === 'mine') return mine;
  // Team is what teams own and what's the person's own, as in the prototype; All adds everything else.
  if (scope === 'team') return or(isNotNull(registryItems.ownerTeam), mine);
  return undefined;
}

/**
 * The row as the contract has it, as the viewer sees it; a row whose details don't fit its kind is a bug, so it fails
 * loudly here.
 */
function toItem(r: Row, viewer: Viewer): RegistryItem {
  return RegistryItem.parse({ ...toSummary(r, viewer), details: seenBy(r, viewer).shown.details });
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
