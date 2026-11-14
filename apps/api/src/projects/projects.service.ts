import type {
  AddSources,
  CitedText,
  NewNote,
  NewProject,
  OrgLibrary,
  Project,
  ProjectAnswer,
  ProjectPatch,
  ProjectQuestion,
  ProjectsOverview,
  ProjectSummary,
} from '@donovan/contracts';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { ChatsService } from '../chats/chats.service.js';
import { DB, type Db } from '../db/db.module.js';
import { chats, projectNotes, projects, projectSources } from '../db/schema.js';
import { ORG_LIBRARIES, SEED_PROJECTS, type SeedProject } from '../seed/projects.fixture.js';
import { SeedService } from '../seed/seed.service.js';
import { sourceId, toCitedText } from './cited.js';

type Row = typeof projects.$inferSelect;
const DAY = 86_400_000;

@Injectable()
export class ProjectsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly seeds: SeedService,
    private readonly chatsService: ChatsService,
  ) {}

  async overview(userId: string): Promise<ProjectsOverview> {
    await this.ensure(userId);
    const rows = await this.db
      .select()
      .from(projects)
      .where(eq(projects.ownerId, userId))
      .orderBy(desc(projects.updatedAt));
    const counts = await this.db
      .select({ projectId: projectSources.projectId, n: count() })
      .from(projectSources)
      .where(eq(projectSources.ownerId, userId))
      .groupBy(projectSources.projectId);
    const n = new Map(counts.map((c) => [c.projectId, c.n]));
    const now = Date.now();
    const org: OrgLibrary[] = ORG_LIBRARIES.map((l) => ({
      id: l.id,
      name: l.name,
      team: l.team,
      sourceCount: l.sourceCount,
      updatedAt: new Date(now - l.daysAgo * DAY).toISOString(),
    }));
    return { org, mine: rows.map((r) => toSummary(r, n.get(r.id) ?? 0)) };
  }

  async get(userId: string, id: string): Promise<Project> {
    await this.ensure(userId);
    const row = await this.row(userId, id);
    const [sources, notes, chatList] = await Promise.all([
      this.db
        .select()
        .from(projectSources)
        .where(and(eq(projectSources.ownerId, userId), eq(projectSources.projectId, id)))
        .orderBy(asc(projectSources.position)),
      this.db
        .select()
        .from(projectNotes)
        .where(and(eq(projectNotes.ownerId, userId), eq(projectNotes.projectId, id)))
        .orderBy(desc(projectNotes.at)),
      this.chatsService.list(userId),
    ]);
    const canned = SEED_PROJECTS.find((p) => p.id === id);
    const selected = new Set(sources.filter((s) => s.selected).map((s) => s.id));
    const added = new Set(sources.map((s) => s.title));
    return {
      ...toSummary(row, sources.length),
      description: row.description,
      sources: sources.map((s) => ({ id: s.id, kind: s.kind, title: s.title, meta: s.meta, selected: s.selected })),
      guide: guideFor(canned, selected),
      questions: canned?.questions ?? [
        'What do these sources agree on?',
        'Where do they disagree?',
        'What is missing?',
      ],
      notes: notes.map((note) => ({ id: note.id, text: note.text, at: note.at.toISOString() })),
      outputs: canned?.outputs ?? [],
      suggestions: (canned?.suggestions ?? [])
        .map((s, i) => ({ id: `x${i + 1}`, ...s }))
        .filter((s) => !added.has(s.title)),
      chats: chatList.filter((c) => c.project === row.name),
      workflows: canned?.workflows ?? [],
    };
  }

  async create(userId: string, body: NewProject): Promise<ProjectSummary> {
    await this.ensure(userId);
    const library = body.fromLibrary ? ORG_LIBRARIES.find((l) => l.id === body.fromLibrary) : undefined;
    if (body.fromLibrary && !library) throw new NotFoundException('No organisation library with that id');
    const id = `${slug(body.name)}-${randomBytes(2).toString('hex')}`;
    const sources = library
      ? [
          { kind: 'doc' as const, title: `${library.name} · overview`, meta: `Doc · from ${library.team}` },
          { kind: 'sheet' as const, title: `${library.name} · index`, meta: `Sheet · ${library.sourceCount} entries` },
        ]
      : [];
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(projects)
        .values({
          ownerId: userId,
          id,
          name: body.name,
          team: 'You',
          sensitivity: body.sensitivity,
          calibrated: body.calibrated,
        })
        .returning();
      if (sources.length)
        await tx
          .insert(projectSources)
          .values(
            sources.map((s, i) => ({ ownerId: userId, projectId: id, id: sourceId(i + 1), position: i + 1, ...s })),
          );
      return toSummary(row!, sources.length);
    });
  }

  /** Renames carry over to the chats filed under the project. */
  async update(userId: string, id: string, patch: ProjectPatch): Promise<ProjectSummary> {
    await this.ensure(userId);
    const before = await this.row(userId, id);
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(projects)
        .set({ ...patch, updatedAt: new Date() })
        .where(and(eq(projects.ownerId, userId), eq(projects.id, id)))
        .returning();
      if (patch.name && patch.name !== before.name)
        await tx
          .update(chats)
          .set({ project: patch.name, updatedAt: sql`${chats.updatedAt}` })
          .where(and(eq(chats.ownerId, userId), eq(chats.project, before.name)));
      const [{ n }] = await tx
        .select({ n: count() })
        .from(projectSources)
        .where(and(eq(projectSources.ownerId, userId), eq(projectSources.projectId, id)));
      return toSummary(row!, n);
    });
  }

  async selectSource(userId: string, id: string, source: string, selected: boolean): Promise<void> {
    await this.ensure(userId);
    await this.row(userId, id);
    const rows = await this.db
      .update(projectSources)
      .set({ selected })
      .where(and(eq(projectSources.ownerId, userId), eq(projectSources.projectId, id), eq(projectSources.id, source)))
      .returning({ id: projectSources.id });
    if (rows.length === 0) throw new NotFoundException('No source with that id in this project');
  }

  /** Adds suggested sources (by their ids in `suggestions`) to the project, selected. */
  async addSources(userId: string, id: string, body: AddSources): Promise<void> {
    const project = await this.get(userId, id);
    const picked = project.suggestions.filter((s) => body.ids.includes(s.id));
    if (picked.length !== body.ids.length) throw new NotFoundException('Some of those suggestions are not available');
    await this.db.insert(projectSources).values(
      picked.map((s, i) => ({
        ownerId: userId,
        projectId: id,
        id: sourceId(project.sources.length + i + 1),
        position: project.sources.length + i + 1,
        kind: s.kind,
        title: s.title,
        meta: s.meta,
      })),
    );
    await this.touch(userId, id);
  }

  /** A (canned) answer from the selected sources, citing them. */
  async ask(userId: string, id: string, body: ProjectQuestion): Promise<ProjectAnswer> {
    const project = await this.get(userId, id);
    const selected = project.sources.filter((s) => s.selected);
    if (selected.length === 0) throw new BadRequestException('Select at least one source to ask about');
    const canned = SEED_PROJECTS.find((p) => p.id === id);
    const answer: CitedText = canned
      ? toCitedText(canned.answer, new Set(selected.map((s) => s.id)))
      : [
          {
            text: `Across your ${selected.length} selected sources, here is what bears on that: start with ${selected[0]!.title}`,
            cite: [selected[0]!.id],
          },
          { text: '.', cite: [] },
        ];
    return { question: body.question, answer, sourcesRead: selected.length };
  }

  async addNote(userId: string, id: string, body: NewNote): Promise<void> {
    await this.ensure(userId);
    await this.row(userId, id);
    await this.db.insert(projectNotes).values({ ownerId: userId, projectId: id, text: body.text });
    await this.touch(userId, id);
  }

  async deleteNote(userId: string, id: string, noteId: string): Promise<void> {
    await this.ensure(userId);
    const rows = await this.db
      .delete(projectNotes)
      .where(and(eq(projectNotes.ownerId, userId), eq(projectNotes.projectId, id), eq(projectNotes.id, noteId)))
      .returning({ id: projectNotes.id });
    if (rows.length === 0) throw new NotFoundException('No note with that id');
  }

  private async ensure(userId: string): Promise<void> {
    await this.seeds.ensureChats(userId);
    await this.seeds.ensureProjects(userId);
  }

  private async row(userId: string, id: string): Promise<Row> {
    const [row] = await this.db
      .select()
      .from(projects)
      .where(and(eq(projects.ownerId, userId), eq(projects.id, id)));
    if (!row) throw new NotFoundException('No project with that id');
    return row;
  }

  private async touch(userId: string, id: string): Promise<void> {
    await this.db
      .update(projects)
      .set({ updatedAt: new Date() })
      .where(and(eq(projects.ownerId, userId), eq(projects.id, id)));
  }
}

function guideFor(canned: SeedProject | undefined, selected: ReadonlySet<string>): CitedText {
  if (selected.size === 0) return [];
  if (canned) return toCitedText(canned.guide, selected);
  return [{ text: `${selected.size} sources selected. Ask a question and the answer will cite them.`, cite: [] }];
}

function toSummary(r: Row, sourceCount: number): ProjectSummary {
  return {
    id: r.id,
    name: r.name,
    team: r.team,
    sensitivity: r.sensitivity,
    calibrated: r.calibrated,
    sourceCount,
    updatedAt: r.updatedAt.toISOString(),
  };
}

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'project'
  );
}
