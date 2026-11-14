import type {
  Artifact,
  ArtifactBody,
  ArtifactPatch,
  ArtifactQuery,
  ArtifactSummary,
  ArtifactUpload,
  Sensitivity,
} from '@donovan/contracts';
import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { DB, type Db } from '../db/db.module.js';
import { artifacts, chats, projects } from '../db/schema.js';
import { SeedService } from '../seed/seed.service.js';
import { ArtifactSearch } from './artifact-search.js';
import { parseUpload, plainText, preview } from './text.js';

type Row = typeof artifacts.$inferSelect;

@Injectable()
export class ArtifactsService {
  readonly #log = new Logger(ArtifactsService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly seeds: SeedService,
    private readonly search: ArtifactSearch,
  ) {}

  /** The person's artifacts, newest first; with `q`, the ones that match it, best first. */
  async list(userId: string, query: ArtifactQuery): Promise<ArtifactSummary[]> {
    await this.ensure(userId);
    if (query.q) {
      const ids = await this.matching(userId, { ...query, q: query.q });
      if (ids.length === 0) return [];
      const rows = await this.rows(userId, inArray(artifacts.id, ids));
      return ids
        .flatMap((id) => rows.filter((r) => r.artifact.id === id))
        .map((r) => toSummary(r.artifact, r.chatTitle));
    }
    const rows = await this.rows(userId, query.kind ? eq(artifacts.kind, query.kind) : undefined);
    return rows.map((r) => toSummary(r.artifact, r.chatTitle));
  }

  async get(userId: string, id: string, ownerName: string): Promise<Artifact> {
    await this.ensure(userId);
    const [row] = await this.rows(userId, eq(artifacts.id, id));
    if (!row) throw new NotFoundException('No artifact with that id');
    const a = row.artifact;
    return {
      ...toSummary(a, row.chatTitle),
      owner: ownerName,
      sharedWith: a.sharedWith,
      versions: a.versions,
      sources: a.sources,
      body: a.body,
    };
  }

  async upload(userId: string, file: ArtifactUpload): Promise<ArtifactSummary> {
    await this.ensure(userId);
    let body;
    try {
      body = parseUpload(file.name, file.content);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
    const now = new Date();
    const id = `${file.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40)}-${randomBytes(3).toString('hex')}`;
    const [row] = await this.db
      .insert(artifacts)
      .values({
        ownerId: userId,
        id,
        name: file.name,
        kind: body.kind,
        sensitivity: file.sensitivity,
        versions: [{ version: 1, at: now.toISOString(), note: 'Uploaded' }],
        sources: ['Uploaded file'],
        body,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    await this.indexQuietly([row!]);
    return toSummary(row!, null);
  }

  /** Makes an artifact (a Studio tool's output, say) and indexes it for search. */
  async create(
    userId: string,
    a: {
      name: string;
      sensitivity: Sensitivity;
      project: string | null;
      sources: string[];
      note: string;
      body: ArtifactBody;
    },
  ): Promise<ArtifactSummary> {
    await this.ensure(userId);
    const now = new Date();
    const id = `${a.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40)}-${randomBytes(3).toString('hex')}`;
    const [row] = await this.db
      .insert(artifacts)
      .values({
        ownerId: userId,
        id,
        name: a.name,
        kind: a.body.kind,
        sensitivity: a.sensitivity,
        project: a.project,
        versions: [{ version: 1, at: now.toISOString(), note: a.note }],
        sources: a.sources,
        body: a.body,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    await this.indexQuietly([row!]);
    return toSummary(row!, null);
  }

  /** Files an artifact under one of the person's projects, or takes it out. */
  async setProject(userId: string, id: string, patch: ArtifactPatch): Promise<ArtifactSummary> {
    await this.ensure(userId);
    await this.seeds.ensureProjects(userId);
    let name: string | null = null;
    if (patch.projectId) {
      const [p] = await this.db
        .select({ name: projects.name })
        .from(projects)
        .where(and(eq(projects.ownerId, userId), eq(projects.id, patch.projectId)));
      if (!p) throw new NotFoundException('No project with that id');
      name = p.name;
    }
    const [row] = await this.db
      .update(artifacts)
      .set({ project: name })
      .where(and(eq(artifacts.ownerId, userId), eq(artifacts.id, id)))
      .returning();
    if (!row) throw new NotFoundException('No artifact with that id');
    const [withChat] = await this.rows(userId, eq(artifacts.id, id));
    return toSummary(row, withChat?.chatTitle ?? null);
  }

  /** The artifacts filed under a project (by its name), newest first. */
  async inProject(userId: string, projectName: string): Promise<ArtifactSummary[]> {
    await this.ensure(userId);
    const rows = await this.rows(userId, eq(artifacts.project, projectName));
    return rows.map((r) => toSummary(r.artifact, r.chatTitle));
  }

  private async ensure(userId: string): Promise<void> {
    await this.seeds.ensureChats(userId);
    await this.seeds.ensureArtifacts(userId, (rows) => this.indexQuietly(rows));
  }

  private rows(userId: string, where?: ReturnType<typeof eq>) {
    return this.db
      .select({ artifact: artifacts, chatTitle: chats.title })
      .from(artifacts)
      .leftJoin(chats, and(eq(chats.ownerId, artifacts.ownerId), eq(chats.id, artifacts.chatId)))
      .where(and(eq(artifacts.ownerId, userId), where))
      .orderBy(desc(artifacts.updatedAt));
  }

  /** Elasticsearch when it answers; otherwise a plain name and text match in Postgres, so search still works. */
  private async matching(userId: string, query: ArtifactQuery & { q: string }): Promise<string[]> {
    try {
      return await this.search.search(userId, query.q, query.kind);
    } catch (err) {
      this.#log.warn(`Artifact search fell back to Postgres: ${String(err)}`);
      const like = `%${query.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
      const rows = await this.db
        .select({ id: artifacts.id })
        .from(artifacts)
        .where(
          and(
            eq(artifacts.ownerId, userId),
            query.kind ? eq(artifacts.kind, query.kind) : undefined,
            or(ilike(artifacts.name, like), sql`${artifacts.body}::text ilike ${like}`),
          ),
        );
      return rows.map((r) => r.id);
    }
  }

  private async indexQuietly(rows: Row[]): Promise<void> {
    try {
      await this.search.index(
        rows.map((r) => ({ ownerId: r.ownerId, id: r.id, name: r.name, kind: r.kind, text: plainText(r.body) })),
      );
    } catch (err) {
      this.#log.warn(`Couldn't index artifacts for search: ${String(err)}`);
    }
  }
}

function toSummary(a: Row, chatTitle: string | null): ArtifactSummary {
  return {
    id: a.id,
    name: a.name,
    kind: a.kind,
    sensitivity: a.sensitivity,
    chat: a.chatId && chatTitle ? { id: a.chatId, title: chatTitle } : null,
    project: a.project,
    version: a.versions.at(-1)!.version,
    updatedAt: a.updatedAt.toISOString(),
    preview: preview(a.body),
  };
}
