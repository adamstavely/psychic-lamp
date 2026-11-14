import type {
  AddSources,
  ArtifactBody,
  ArtifactSummary,
  DocBlock,
  NewOutput,
  ProjectShares,
  Recipient,
  SourceCandidate,
  SourceSearch,
  SourceSearchResult,
  CitedText,
  NewNote,
  NewSource,
  ProjectSource,
  SourceCatalog,
  NewProject,
  OrgLibrary,
  Project,
  ProjectAnswer,
  ProjectPatch,
  ProjectQuestion,
  ProjectsOverview,
  ProjectSummary,
  Artifact,
  SharedProjectSummary,
} from '@donovan/contracts';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { ArtifactsService } from '../artifacts/artifacts.service.js';
import { ChatsService } from '../chats/chats.service.js';
import { DB, type Db } from '../db/db.module.js';
import {
  artifacts,
  chats,
  projectAnswers,
  projectNotes,
  projects,
  projectShares,
  projectSources,
  users,
} from '../db/schema.js';
import {
  ORG_LIBRARIES,
  SEED_PROJECTS,
  SOURCE_CONNECTORS,
  SOURCE_DATASETS,
  type SeedProject,
} from '../seed/projects.fixture.js';
import { SeedService } from '../seed/seed.service.js';
import { calibrate } from './calibrated.js';
import { sourceId, toCitedText } from './cited.js';

type Row = typeof projects.$inferSelect;

/** Each Studio tool's name, as its outputs are titled. */
const TOOL_LABELS: Record<NewOutput['tool'], string> = {
  brief: 'Brief',
  report: 'Report',
  deck: 'Slide deck',
  table: 'Data table',
  mindmap: 'Mind map',
  faq: 'FAQ',
  quiz: 'Quiz',
  audio: 'Audio overview',
  timeline: 'Timeline',
};

const KIND_LABELS: Record<ProjectSource['kind'], string> = {
  pdf: 'Documents',
  doc: 'Documents',
  sheet: 'Data',
  dataset: 'Data',
  connector: 'Live systems',
  slack: 'Conversations',
  web: 'Web',
};
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
    return { org, mine: rows.map((r) => toSummary(r, n.get(r.id) ?? 0)), shared: await this.sharedWith(userId) };
  }

  /** Other people's projects shared with this person, most recent first. */
  private async sharedWith(userId: string): Promise<SharedProjectSummary[]> {
    const rows = await this.db
      .select({ project: projects, ownerName: users.name, level: projectShares.level })
      .from(projectShares)
      .innerJoin(projects, and(eq(projects.ownerId, projectShares.ownerId), eq(projects.id, projectShares.projectId)))
      .innerJoin(users, eq(users.id, projects.ownerId))
      .where(eq(projectShares.recipientId, recipientIdFor(userId)))
      .orderBy(desc(projects.updatedAt));
    if (rows.length === 0) return [];
    const counts = await this.db
      .select({ ownerId: projectSources.ownerId, projectId: projectSources.projectId, n: count() })
      .from(projectSources)
      .where(inArray(projectSources.ownerId, [...new Set(rows.map((r) => r.project.ownerId))]))
      .groupBy(projectSources.ownerId, projectSources.projectId);
    const n = new Map(counts.map((c) => [`${c.ownerId}/${c.projectId}`, c.n]));
    return rows.map((r) => ({
      ...toSummary(r.project, n.get(`${r.project.ownerId}/${r.project.id}`) ?? 0),
      ownerId: r.project.ownerId,
      ownerName: r.ownerName,
      level: r.level,
    }));
  }

  /**
   * A project someone shared with this person, to read: its sources, guide and outputs. What's private to the owner
   * (their chat with the project, notes, chats, who else it's shared with) stays out. Anyone it isn't shared with gets
   * the same 404 as for a project that doesn't exist.
   */
  async getShared(userId: string, ownerId: string, id: string): Promise<Project> {
    const ownerName = await this.grantedBy(userId, ownerId, id);
    const p = await this.get(ownerId, id);
    return {
      ...p,
      readOnly: true,
      access: 'viewer',
      ownerName,
      sharedWith: [],
      notes: [],
      chats: [],
      thread: [],
      suggestions: [],
    };
  }

  /** An output of a project shared with this person: an artifact filed under that project, and no other. */
  async sharedArtifact(userId: string, ownerId: string, id: string, artifactId: string): Promise<Artifact> {
    const ownerName = await this.grantedBy(userId, ownerId, id);
    const a = await this.artifactsService.get(ownerId, artifactId, ownerName);
    if (a.projectId !== id) throw new NotFoundException('No project with that id');
    return a;
  }

  /** The owner's name, if they shared this project with the person; otherwise not found. */
  private async grantedBy(userId: string, ownerId: string, id: string): Promise<string> {
    const [grant] = await this.db
      .select({ ownerName: users.name })
      .from(projectShares)
      .innerJoin(users, eq(users.id, projectShares.ownerId))
      .where(
        and(
          eq(projectShares.ownerId, ownerId),
          eq(projectShares.projectId, id),
          eq(projectShares.recipientId, recipientIdFor(userId)),
        ),
      );
    if (!grant) throw new NotFoundException('No project with that id');
    return grant.ownerName;
  }

  async get(userId: string, id: string): Promise<Project> {
    await this.ensure(userId);
    const row = await this.row(userId, id);
    const [sources, notes, chatList, shares, outputs, thread] = await Promise.all([
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
      this.db
        .select()
        .from(projectShares)
        .where(and(eq(projectShares.ownerId, userId), eq(projectShares.projectId, id))),
      this.artifactsService.inProject(userId, row.id),
      this.db
        .select()
        .from(projectAnswers)
        .where(and(eq(projectAnswers.ownerId, userId), eq(projectAnswers.projectId, id)))
        .orderBy(asc(projectAnswers.at)),
    ]);
    const canned = SEED_PROJECTS.find((p) => p.id === id);
    const selected = new Set(sources.filter((s) => s.selected).map((s) => s.id));
    const added = new Set(sources.map((s) => s.title));
    return {
      ...toSummary(row, sources.length),
      readOnly: false,
      access: 'owner',
      ownerName: null,
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
      chats: chatList.filter((c) => c.projectId === row.id),
      workflows: canned?.workflows ?? [],
      thread: thread.map(toAnswer),
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
      // The name shown on what's filed under this project (by id: another project with the same name is untouched).
      if (patch.name && patch.name !== before.name) {
        await tx
          .update(chats)
          .set({ project: patch.name, updatedAt: sql`${chats.updatedAt}` })
          .where(and(eq(chats.ownerId, userId), eq(chats.projectId, id)));
        await tx
          .update(artifacts)
          .set({ project: patch.name })
          .where(and(eq(artifacts.ownerId, userId), eq(artifacts.projectId, id)));
      }
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
    const fresh = body.sources.filter(
      (s, i, all) => !have.has(s.title) && all.findIndex((x) => x.title === s.title) === i,
    );
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

  /** Connectors and datasets that can be added as sources. */
  catalog(): SourceCatalog {
    return { connectors: SOURCE_CONNECTORS, datasets: SOURCE_DATASETS };
  }

  /**
   * Adds one source by hand: an uploaded file, a link, a connector, a dataset or pasted text. It's selected, and kept
   * even if another source has the same title (two uploads can share a name).
   */
  async addSource(userId: string, id: string, body: NewSource): Promise<ProjectSource> {
    await this.ensure(userId);
    await this.row(userId, id);
    const source = describe(body);
    return this.db.transaction(async (tx) => {
      const [{ n }] = await tx
        .select({ n: sql<number>`coalesce(max(${projectSources.position}), 0)::int` })
        .from(projectSources)
        .where(and(eq(projectSources.ownerId, userId), eq(projectSources.projectId, id)));
      const position = n + 1;
      const [row] = await tx
        .insert(projectSources)
        .values({ ownerId: userId, projectId: id, id: sourceId(position), position, ...source })
        .returning();
      await tx
        .update(projects)
        .set({ updatedAt: new Date() })
        .where(and(eq(projects.ownerId, userId), eq(projects.id, id)));
      return { id: row!.id, kind: row!.kind, title: row!.title, meta: row!.meta, selected: row!.selected };
    });
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
    const live = (c: SourceCandidate) => c.kind === 'connector' || c.kind === 'dataset';
    const inScope = (c: SourceCandidate) =>
      body.scope === 'all' ||
      (body.scope === 'web' ? c.kind === 'web' : body.scope === 'connectors' ? live(c) : c.kind !== 'web');
    const known = project.suggestions
      .filter(inScope)
      .filter((c) => words.some((w) => c.title.toLowerCase().includes(w)));
    const q = body.query.trim();
    const connectors: SourceCandidate[] = [...SOURCE_CONNECTORS, ...SOURCE_DATASETS]
      .filter((c) => words.some((w) => `${c.name} ${c.detail}`.toLowerCase().includes(w)))
      .map((c) => ({
        kind: SOURCE_DATASETS.includes(c) ? ('dataset' as const) : ('connector' as const),
        title: c.name,
        meta: SOURCE_DATASETS.includes(c) ? `Dataset · ${c.detail}` : `Live connector · ${c.detail}`,
      }));
    const found: SourceCandidate[] =
      body.scope === 'connectors'
        ? connectors
        : [
            ...(body.scope === 'all' ? connectors : []),
            ...(body.scope !== 'web'
              ? [
                  { kind: 'doc' as const, title: `${capitalise(q)}: team notes`, meta: 'Shared drive · Doc' },
                  {
                    kind: 'slack' as const,
                    title: `#${slug(q).slice(0, 20)}: recent discussion`,
                    meta: 'Slack · 14 messages',
                  },
                ]
              : []),
            ...(body.scope !== 'workspace'
              ? [{ kind: 'web' as const, title: `${capitalise(q)}: an overview`, meta: 'Web · 6 min read' }]
              : []),
            ...(body.depth === 'deep'
              ? [
                  { kind: 'pdf' as const, title: `${capitalise(q)}: research report`, meta: 'PDF · 24 pages' },
                  ...(body.scope !== 'workspace'
                    ? [{ kind: 'web' as const, title: `Recent news on ${q}`, meta: 'Web · 3 articles' }]
                    : []),
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
    const label = TOOL_LABELS[body.tool];
    const guideText = project.guide
      .map((g) => g.text)
      .join('')
      .trim();
    const canned = SEED_PROJECTS.find((p) => p.id === id);
    const answer = canned
      ? toCitedText(canned.answer, new Set(selected.map((s) => s.id)))
          .map((g) => g.text)
          .join('')
          .trim()
      : '';
    /** The guide as statements, for outlines, quizzes and scripts. */
    const points = guideText
      .split(/(?<=[.!?])\s+/)
      .map((p) => p.trim())
      .filter((p) => /\p{L}/u.test(p));
    const bodyFor: Record<NewOutput['tool'], ArtifactBody> = {
      brief: {
        kind: 'Doc',
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            title: `Made from ${selected.length} sources`,
            text: `A brief on ${project.name}, from the project's selected sources.`,
          },
          { type: 'heading', text: 'Summary' },
          {
            type: 'paragraph',
            text: guideText || project.description || `What the ${selected.length} selected sources cover.`,
          },
          { type: 'heading', text: 'Sources' },
          { type: 'list', items: selected.map((s) => `${s.title} (${s.meta})`) },
          ...verification(project, selected),
        ],
      },
      table: {
        kind: 'Doc',
        blocks: [
          { type: 'heading', text: `Sources in ${project.name}` },
          {
            type: 'table',
            columns: ['Source', 'Kind', 'Detail'],
            rows: selected.map((s) => [s.title, s.kind, s.meta]),
          },
        ],
      },
      faq: {
        kind: 'Doc',
        blocks: project.questions.flatMap((q, i) => [
          { type: 'heading' as const, text: q },
          {
            type: 'paragraph' as const,
            text: i === 0 && answer ? answer : 'Ask this in the project to get an answer that cites its sources.',
          },
        ]),
      },
      timeline: {
        kind: 'Doc',
        blocks: [
          { type: 'heading', text: `${project.name}: what each source adds` },
          { type: 'list', items: selected.map((s) => `${s.title}: ${s.meta}`) },
        ],
      },
      report: {
        kind: 'Doc',
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            title: `A report from ${selected.length} sources`,
            text: project.description || `What the selected sources in ${project.name} say.`,
          },
          { type: 'heading', text: 'Summary' },
          { type: 'paragraph', text: guideText || `What the ${selected.length} selected sources cover.` },
          { type: 'heading', text: 'What each source contributes' },
          { type: 'list', items: selected.map((s) => `${s.title} (${s.meta})`) },
          { type: 'heading', text: 'Open questions' },
          { type: 'list', items: project.questions.length ? project.questions : ['What is still missing?'] },
          ...verification(project, selected),
        ],
      },
      deck: {
        kind: 'Doc',
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            title: 'A slide outline',
            text: 'One heading per slide. Copy it as Markdown into your slide tool.',
          },
          { type: 'heading', text: `Slide 1 · ${project.name}` },
          { type: 'paragraph', text: project.description || `${selected.length} sources, summarised.` },
          { type: 'heading', text: 'Slide 2 · What we know' },
          { type: 'list', items: points.length ? points.slice(0, 4) : ['Select sources to fill this in.'] },
          { type: 'heading', text: 'Slide 3 · Sources' },
          { type: 'list', items: selected.map((s) => s.title) },
          { type: 'heading', text: 'Slide 4 · Open questions' },
          { type: 'list', items: project.questions.length ? project.questions : ['What is still missing?'] },
        ],
      },
      mindmap: {
        kind: 'Doc',
        blocks: [
          { type: 'heading', text: project.name },
          ...[...byKind(selected)].flatMap(([kind, list]) => [
            { type: 'heading' as const, text: kind },
            { type: 'list' as const, items: list.map((s) => s.title) },
          ]),
          ...(project.questions.length
            ? [
                { type: 'heading' as const, text: 'Questions' },
                { type: 'list' as const, items: project.questions },
              ]
            : []),
        ],
      },
      quiz: {
        kind: 'Doc',
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            title: 'True or false?',
            text: 'Each statement comes from the selected sources; the answers are at the end.',
          },
          ...(points.length ? points.slice(0, 5) : [`${project.name} has ${selected.length} selected sources`]).flatMap(
            (p, i) => [
              { type: 'heading' as const, text: `Question ${i + 1}` },
              { type: 'paragraph' as const, text: p },
            ],
          ),
          { type: 'heading', text: 'Answers' },
          {
            type: 'list',
            items: (points.length ? points.slice(0, 5) : ['x']).map(
              (_, i) => `Question ${i + 1}: true, as the sources say`,
            ),
          },
        ],
      },
      audio: {
        kind: 'Doc',
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            title: 'An audio overview script',
            text: "Two voices talk through the sources. Audio isn't made in this version: read it, or paste it into a text-to-speech tool.",
          },
          { type: 'heading', text: `${project.name}, in conversation` },
          {
            type: 'paragraph',
            text: `Host A: Today it's ${project.name}, from ${selected.length} sources. Where do we start?`,
          },
          ...(points.length ? points.slice(0, 4) : [project.description || 'The sources are still being read.']).map(
            (p, i) => ({ type: 'paragraph' as const, text: `${i % 2 ? 'Host A' : 'Host B'}: ${p}` }),
          ),
          {
            type: 'paragraph',
            text: `Host A: And what's still open? Host B: ${project.questions[0] ?? 'What the sources leave out.'}`,
          },
        ],
      },
    };
    const made = await this.artifactsService.create(userId, {
      name: `${label} — ${project.name}`,
      sensitivity: project.sensitivity,
      project: { id: project.id, name: project.name },
      sources: selected.map((s) => s.title),
      note: `Made by the ${label} tool from ${selected.length} sources`,
      body: bodyFor[body.tool],
    });
    await this.touch(userId, id);
    return made;
  }

  /**
   * Replaces who the project is shared with. Every recipient is resolved here, from people who have signed in to
   * Donovan, by the id the directory gave out; the name and kind the client sent are ignored. Teams are refused (sign-in
   * doesn't say who is in a team yet, so a team grant couldn't be enforced), as are the owner, duplicates and anyone
   * unknown. For the pilot, sharing is to view.
   */
  async setShares(userId: string, id: string, body: ProjectShares): Promise<void> {
    await this.ensure(userId);
    await this.row(userId, id);
    const ids = body.access.map((g) => g.recipient.id);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Each person can be added once');
    const people = ids.map((rid) => {
      const personId = /^user:([0-9a-f-]{36})$/.exec(rid)?.[1];
      if (!personId)
        throw new BadRequestException(
          "Projects can be shared with people for now; sharing with teams needs your sign-in to say who's in them",
        );
      return personId;
    });
    if (people.includes(userId)) throw new BadRequestException("You don't need to share a project with yourself");
    const found = people.length
      ? await this.db
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(inArray(users.id, people))
      : [];
    if (found.length !== people.length) throw new BadRequestException("Someone you picked isn't in Donovan");
    const byId = new Map(found.map((u) => [u.id, u]));
    await this.db.transaction(async (tx) => {
      await tx.delete(projectShares).where(and(eq(projectShares.ownerId, userId), eq(projectShares.projectId, id)));
      if (people.length)
        await tx.insert(projectShares).values(
          people.map((pid) => {
            const u = byId.get(pid)!;
            return {
              ownerId: userId,
              projectId: id,
              recipientId: recipientIdFor(pid),
              kind: 'person' as const,
              name: u.name,
              detail: u.email,
              level: 'viewer' as const,
            };
          }),
        );
    });
  }

  /** People who have signed in to Donovan: who a project can be shared with. */
  async directory(userId: string): Promise<Recipient[]> {
    const people = await this.db.select({ id: users.id, name: users.name, email: users.email }).from(users);
    return [
      ...people
        .filter((p) => p.id !== userId)
        .map((p) => ({
          id: `user:${p.id}`,
          kind: 'person' as const,
          name: p.name,
          ...(p.email ? { detail: p.email } : {}),
        })),
    ];
  }

  /** An organisation library, to read before copying it. */
  library(libraryId: string): Project {
    const l = ORG_LIBRARIES.find((x) => x.id === libraryId);
    if (!l) throw new NotFoundException('No organisation library with that id');
    const sources = l.sources.map((s, i) => ({
      id: sourceId(i + 1),
      kind: s.kind,
      title: s.title,
      meta: s.meta,
      selected: true,
    }));
    return {
      id: l.id,
      name: l.name,
      team: l.team,
      sensitivity: 'Internal',
      calibrated: false,
      sourceCount: l.sourceCount,
      updatedAt: new Date(Date.now() - l.daysAgo * DAY).toISOString(),
      readOnly: true,
      access: 'library',
      ownerName: null,
      description: l.description,
      attached: [],
      sharedWith: [{ recipient: { id: 'org', kind: 'group', name: 'Everyone in the organisation' }, level: 'viewer' }],
      sources,
      guide: [
        {
          text: `${l.description} ${l.sourceCount} sources; ${sources.length} shown here. Copy the library to ask questions about them.`,
          cite: [],
        },
      ],
      questions: [],
      notes: [],
      outputs: [],
      suggestions: [],
      chats: [],
      workflows: [],
      thread: [],
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
    const calibrated = project.calibrated ? calibrate(answer, selected) : null;
    const [row] = await this.db
      .insert(projectAnswers)
      .values({
        ownerId: userId,
        projectId: id,
        question: body.question,
        answer,
        sourcesRead: selected.length,
        claims: calibrated?.claims ?? null,
        checkpoint: calibrated?.checkpoint ?? null,
      })
      .returning();
    await this.touch(userId, id);
    return toAnswer(row!);
  }

  /** Clears the project's chat. */
  async clearThread(userId: string, id: string): Promise<void> {
    await this.ensure(userId);
    await this.row(userId, id);
    await this.db
      .delete(projectAnswers)
      .where(and(eq(projectAnswers.ownerId, userId), eq(projectAnswers.projectId, id)));
  }

  async addNote(userId: string, id: string, body: NewNote): Promise<void> {
    await this.ensure(userId);
    await this.row(userId, id);
    await this.db.insert(projectNotes).values({ ownerId: userId, projectId: id, text: body.text });
    await this.touch(userId, id);
  }

  async updateNote(userId: string, id: string, noteId: string, body: NewNote): Promise<void> {
    await this.ensure(userId);
    const rows = await this.db
      .update(projectNotes)
      .set({ text: body.text })
      .where(and(eq(projectNotes.ownerId, userId), eq(projectNotes.projectId, id), eq(projectNotes.id, noteId)))
      .returning({ id: projectNotes.id });
    if (rows.length === 0) throw new NotFoundException('No note with that id');
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

/** In a Calibrated project, an output ends with its claims labelled and what to check before acting. */
function verification(project: Project, selected: Project['sources']): DocBlock[] {
  if (!project.calibrated || project.guide.length === 0) return [];
  const { claims, checkpoint } = calibrate(project.guide, selected);
  const label = { high: 'two or more sources', medium: 'one source', low: 'no source' } as const;
  return [
    { type: 'heading', text: 'Claims and what backs them' },
    { type: 'list', items: claims.map((c) => `${c.text} (${label[c.confidence]})`) },
    { type: 'callout', tone: 'warning', title: 'Check before acting', text: checkpoint },
  ];
}

/** Sources grouped under a plain label for their kind, in order of first appearance. */
function byKind(sources: Project['sources']): Map<string, Project['sources']> {
  const groups = new Map<string, Project['sources']>();
  for (const s of sources) groups.set(KIND_LABELS[s.kind], [...(groups.get(KIND_LABELS[s.kind]) ?? []), s]);
  return groups;
}

function toAnswer(r: typeof projectAnswers.$inferSelect): ProjectAnswer {
  return {
    id: r.id,
    question: r.question,
    answer: r.answer,
    sourcesRead: r.sourcesRead,
    at: r.at.toISOString(),
    claims: r.claims ?? null,
    checkpoint: r.checkpoint ?? null,
  };
}

function guideFor(canned: SeedProject | undefined, selected: ReadonlySet<string>): CitedText {
  if (selected.size === 0) return [];
  if (canned) return toCitedText(canned.guide, selected);
  return [{ text: `${selected.size} sources selected. Ask a question and the answer will cite them.`, cite: [] }];
}

/** A hand-added source's kind, title and detail line. */
function describe(body: NewSource): {
  kind: ProjectSource['kind'];
  title: string;
  meta: string;
  url?: string;
  content?: string;
} {
  switch (body.from) {
    case 'upload': {
      const ext = body.name.split('.').pop()?.toLowerCase() ?? '';
      const kind = ext === 'pdf' ? 'pdf' : ['csv', 'xlsx', 'xls', 'tsv'].includes(ext) ? 'sheet' : 'doc';
      const label = ext ? ext.toUpperCase() : 'File';
      return { kind, title: body.name, meta: `${label} · ${size(body.size)} · uploaded`, content: body.content };
    }
    case 'link': {
      const url = new URL(body.url);
      const host = url.hostname.replace(/^www\./, '');
      const path = url.pathname.replace(/\/$/, '');
      return {
        kind: 'web',
        title: path && path !== '/' ? `${host}${path}` : host,
        meta: `Web · ${host}`,
        url: body.url,
      };
    }
    case 'connector': {
      const c = SOURCE_CONNECTORS.find((x) => x.id === body.id);
      if (!c) throw new BadRequestException('No connector with that id');
      return { kind: 'connector', title: c.name, meta: `Live connector · ${c.detail}` };
    }
    case 'dataset': {
      const d = SOURCE_DATASETS.find((x) => x.id === body.id);
      if (!d) throw new BadRequestException('No dataset with that id');
      return { kind: 'dataset', title: d.name, meta: `Dataset · ${d.detail}` };
    }
    case 'paste': {
      const words = body.text.split(/\s+/).filter(Boolean).length;
      const title = body.title || `${body.text.slice(0, 48).trim()}${body.text.length > 48 ? '…' : ''}`;
      return {
        kind: 'doc',
        title,
        meta: `Text · ${words} ${words === 1 ? 'word' : 'words'} · pasted`,
        content: body.text,
      };
    }
  }
}

function size(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`;
}

/** How a person appears as a share's recipient. */
const recipientIdFor = (userId: string) => `user:${userId}`;

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
