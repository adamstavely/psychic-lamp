import type {
  AddSources,
  ArtifactBody,
  ArtifactSummary,
  NewOutput,
  ProjectShares,
  Recipient,
  SourceCandidate,
  SourceSearch,
  SourceSearchResult,
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
import { ArtifactsService } from '../artifacts/artifacts.service.js';
import { ChatsService } from '../chats/chats.service.js';
import { DB, type Db } from '../db/db.module.js';
import { artifacts, chats, projectNotes, projects, projectShares, projectSources, users } from '../db/schema.js';
import { ORG_LIBRARIES, SEED_PROJECTS, TEAMS, type SeedProject } from '../seed/projects.fixture.js';
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
    private readonly artifactsService: ArtifactsService,
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
    const [sources, notes, chatList, shares, outputs] = await Promise.all([
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
      this.db.select().from(projectShares).where(and(eq(projectShares.ownerId, userId), eq(projectShares.projectId, id))),
      this.artifactsService.inProject(userId, row.name),
    ]);
    const canned = SEED_PROJECTS.find((p) => p.id === id);
    const selected = new Set(sources.filter((s) => s.selected).map((s) => s.id));
    const added = new Set(sources.map((s) => s.title));
    return {
      ...toSummary(row, sources.length),
      readOnly: false,
      description: row.description,
      attached: canned?.attached ?? [],
      sharedWith: shares.map((sh) => ({
        recipient: { id: sh.recipientId, kind: sh.kind, name: sh.name, ...(sh.detail ? { detail: sh.detail } : {}) },
        level: sh.level,
      })),
      sources: sources.map((s) => ({ id: s.id, kind: s.kind, title: s.title, meta: s.meta, selected: s.selected })),
      guide: guideFor(canned, selected),
      questions: canned?.questions ?? [
        'What do these sources agree on?',
        'Where do they disagree?',
        'What is missing?',
      ],
      notes: notes.map((note) => ({ id: note.id, text: note.text, at: note.at.toISOString() })),
      outputs: outputs.map((a) => ({ artifactId: a.id, title: a.name, meta: `${a.kind} · v${a.version}` })),
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
      if (patch.name && patch.name !== before.name)
        await tx
          .update(artifacts)
          .set({ project: patch.name })
          .where(and(eq(artifacts.ownerId, userId), eq(artifacts.project, before.name)));
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

  /** Adds sources (from the suggestions or a search) to the project, selected. Ones it already has are skipped. */
  async addSources(userId: string, id: string, body: AddSources): Promise<void> {
    const project = await this.get(userId, id);
    if (project.readOnly) throw new BadRequestException("An organisation library can't be changed here");
    const have = new Set(project.sources.map((s) => s.title));
    const fresh = body.sources.filter((s, i, all) => !have.has(s.title) && all.findIndex((x) => x.title === s.title) === i);
    if (fresh.length === 0) return;
    await this.db.insert(projectSources).values(
      fresh.map((s, i) => ({
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

  async selectAll(userId: string, id: string, selected: boolean): Promise<void> {
    await this.ensure(userId);
    await this.row(userId, id);
    await this.db
      .update(projectSources)
      .set({ selected })
      .where(and(eq(projectSources.ownerId, userId), eq(projectSources.projectId, id)));
  }

  /**
   * Finds sources to add (canned): the project's own suggestions that match the scope, then what the query turns up.
   * A deep search looks further and finds more.
   */
  async searchSources(userId: string, id: string, body: SourceSearch): Promise<SourceSearchResult> {
    const project = await this.get(userId, id);
    const words = body.query.toLowerCase().split(/\s+/);
    const inScope = (c: SourceCandidate) =>
      body.scope === 'all' || (body.scope === 'web' ? c.kind === 'web' : c.kind !== 'web');
    const known = project.suggestions.filter(inScope).filter((c) => words.some((w) => c.title.toLowerCase().includes(w)));
    const q = body.query.trim();
    const found: SourceCandidate[] = [
      ...(body.scope !== 'web'
        ? [
            { kind: 'doc' as const, title: `${capitalise(q)}: team notes`, meta: 'Shared drive · Doc' },
            { kind: 'slack' as const, title: `#${slug(q).slice(0, 20)}: recent discussion`, meta: 'Slack · 14 messages' },
          ]
        : []),
      ...(body.scope !== 'workspace'
        ? [{ kind: 'web' as const, title: `${capitalise(q)}: an overview`, meta: 'Web · 6 min read' }]
        : []),
      ...(body.depth === 'deep'
        ? [
            { kind: 'pdf' as const, title: `${capitalise(q)}: research report`, meta: 'PDF · 24 pages' },
            ...(body.scope !== 'workspace' ? [{ kind: 'web' as const, title: `Recent news on ${q}`, meta: 'Web · 3 articles' }] : []),
          ]
        : []),
    ];
    const have = new Set(project.sources.map((s) => s.title));
    const results = [...known, ...found].filter((c) => !have.has(c.title));
    return { results, searched: body.depth === 'deep' ? 120 : 30 };
  }

  /** A Studio tool's output, made from the selected sources and filed under the project as an artifact. */
  async createOutput(userId: string, id: string, body: NewOutput): Promise<ArtifactSummary> {
    const project = await this.get(userId, id);
    const selected = project.sources.filter((s) => s.selected);
    if (selected.length === 0) throw new BadRequestException('Select at least one source first');
    const label = { brief: 'Brief', table: 'Source table', faq: 'FAQ', timeline: 'Timeline' }[body.tool];
    const guideText = project.guide.map((g) => g.text).join('').trim();
    const canned = SEED_PROJECTS.find((p) => p.id === id);
    const answer = canned ? toCitedText(canned.answer, new Set(selected.map((s) => s.id))).map((g) => g.text).join('').trim() : '';
    const bodyFor: Record<NewOutput['tool'], ArtifactBody> = {
      brief: {
        kind: 'Doc',
        blocks: [
          { type: 'callout', tone: 'info', title: `Made from ${selected.length} sources`, text: `A brief on ${project.name}, from the project's selected sources.` },
          { type: 'heading', text: 'Summary' },
          { type: 'paragraph', text: guideText || project.description || `What the ${selected.length} selected sources cover.` },
          { type: 'heading', text: 'Sources' },
          { type: 'list', items: selected.map((s) => `${s.title} (${s.meta})`) },
        ],
      },
      table: {
        kind: 'Doc',
        blocks: [
          { type: 'heading', text: `Sources in ${project.name}` },
          { type: 'table', columns: ['Source', 'Kind', 'Detail'], rows: selected.map((s) => [s.title, s.kind, s.meta]) },
        ],
      },
      faq: {
        kind: 'Doc',
        blocks: project.questions.flatMap((q, i) => [
          { type: 'heading' as const, text: q },
          { type: 'paragraph' as const, text: i === 0 && answer ? answer : 'Ask this in the project to get an answer that cites its sources.' },
        ]),
      },
      timeline: {
        kind: 'Doc',
        blocks: [
          { type: 'heading', text: `${project.name}: what each source adds` },
          { type: 'list', items: selected.map((s) => `${s.title}: ${s.meta}`) },
        ],
      },
    };
    const made = await this.artifactsService.create(userId, {
      name: `${label} — ${project.name}`,
      sensitivity: project.sensitivity,
      project: project.name,
      sources: selected.map((s) => s.title),
      note: `Made by the ${label} tool from ${selected.length} sources`,
      body: bodyFor[body.tool],
    });
    await this.touch(userId, id);
    return made;
  }

  /** Replaces who the project is shared with. */
  async setShares(userId: string, id: string, body: ProjectShares): Promise<void> {
    await this.ensure(userId);
    await this.row(userId, id);
    await this.db.transaction(async (tx) => {
      await tx.delete(projectShares).where(and(eq(projectShares.ownerId, userId), eq(projectShares.projectId, id)));
      if (body.access.length)
        await tx.insert(projectShares).values(
          body.access.map((g) => ({
            ownerId: userId,
            projectId: id,
            recipientId: g.recipient.id,
            kind: g.recipient.kind,
            name: g.recipient.name,
            detail: g.recipient.detail ?? null,
            level: g.level,
          })),
        );
    });
  }

  /** People who have signed in to Donovan, and teams: who a project can be shared with. */
  async directory(userId: string): Promise<Recipient[]> {
    const people = await this.db.select({ id: users.id, name: users.name, email: users.email }).from(users);
    return [
      ...people
        .filter((p) => p.id !== userId)
        .map((p) => ({ id: `user:${p.id}`, kind: 'person' as const, name: p.name, ...(p.email ? { detail: p.email } : {}) })),
      ...TEAMS.map((t) => ({ id: `team:${slug(t)}`, kind: 'group' as const, name: t, detail: 'Team' })),
    ];
  }

  /** An organisation library, to read before copying it. */
  library(libraryId: string): Project {
    const l = ORG_LIBRARIES.find((x) => x.id === libraryId);
    if (!l) throw new NotFoundException('No organisation library with that id');
    const sources = l.sources.map((s, i) => ({ id: sourceId(i + 1), kind: s.kind, title: s.title, meta: s.meta, selected: true }));
    return {
      id: l.id,
      name: l.name,
      team: l.team,
      sensitivity: 'Internal',
      calibrated: false,
      sourceCount: l.sourceCount,
      updatedAt: new Date(Date.now() - l.daysAgo * DAY).toISOString(),
      readOnly: true,
      description: l.description,
      attached: [],
      sharedWith: [{ recipient: { id: 'org', kind: 'group', name: 'Everyone in the organisation' }, level: 'viewer' }],
      sources,
      guide: [{ text: `${l.description} ${l.sourceCount} sources; ${sources.length} shown here. Copy the library to ask questions about them.`, cite: [] }],
      questions: [],
      notes: [],
      outputs: [],
      suggestions: [],
      chats: [],
      workflows: [],
    };
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

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
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
