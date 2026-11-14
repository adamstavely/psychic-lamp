import { z } from 'zod';
import { ChatSummary, Claim, Sensitivity } from './chat.js';
import { UPLOAD_LIMIT_BYTES } from './defaults.js';

const Iso = z.iso.datetime({ offset: true });

export const SourceKind = z.enum(['pdf', 'sheet', 'doc', 'slack', 'connector', 'web', 'dataset']);
export type SourceKind = z.infer<typeof SourceKind>;

export const ProjectSource = z.object({
  id: z.string(),
  kind: SourceKind,
  title: z.string(),
  meta: z.string(),
  /** Answers in the project cite only the selected sources. */
  selected: z.boolean(),
});
export type ProjectSource = z.infer<typeof ProjectSource>;

/** Text with citations: each segment names the sources (by id) it rests on. */
export const CitedText = z.array(z.object({ text: z.string(), cite: z.array(z.string()) }));
export type CitedText = z.infer<typeof CitedText>;

export const ProjectNote = z.object({ id: z.string(), text: z.string(), at: Iso });
export type ProjectNote = z.infer<typeof ProjectNote>;

export const ProjectSummary = z.object({
  id: z.string(),
  name: z.string(),
  team: z.string(),
  sensitivity: Sensitivity,
  calibrated: z.boolean(),
  sourceCount: z.number().int().nonnegative(),
  updatedAt: Iso,
});
export type ProjectSummary = z.infer<typeof ProjectSummary>;

/** A source library someone published to the whole organisation; anyone can copy it into a project of their own. */
export const OrgLibrary = z.object({
  id: z.string(),
  name: z.string(),
  team: z.string(),
  sourceCount: z.number().int().nonnegative(),
  updatedAt: Iso,
});
export type OrgLibrary = z.infer<typeof OrgLibrary>;

export const ProjectsOverview = z.object({ org: z.array(OrgLibrary), mine: z.array(ProjectSummary) });
export type ProjectsOverview = z.infer<typeof ProjectsOverview>;

/** Someone (or a team) a project is shared with, and what they can do. */
export const Recipient = z.object({
  id: z.string().min(1).max(120),
  kind: z.enum(['person', 'group']),
  name: z.string().min(1).max(120),
  detail: z.string().max(200).optional(),
});
export type Recipient = z.infer<typeof Recipient>;

export const ShareLevel = z.enum(['viewer', 'editor']);
export const ProjectShare = z.object({ recipient: Recipient, level: ShareLevel });
export type ProjectShare = z.infer<typeof ProjectShare>;

export const ProjectShares = z.strictObject({ access: z.array(ProjectShare).max(100) });
export type ProjectShares = z.infer<typeof ProjectShares>;

/** A source a search found, not yet added. */
export const SourceCandidate = z.object({
  kind: SourceKind,
  title: z.string().min(1).max(200),
  meta: z.string().max(200),
});
export type SourceCandidate = z.infer<typeof SourceCandidate>;

export const SourceSearch = z.strictObject({
  query: z.string().trim().min(1, 'Say what to look for').max(200),
  scope: z.enum(['workspace', 'web', 'connectors', 'all']).default('all'),
  depth: z.enum(['quick', 'deep']).default('quick'),
});
export type SourceSearch = z.infer<typeof SourceSearch>;

export const SourceSearchResult = z.object({ results: z.array(SourceCandidate), searched: z.number().int() });
export type SourceSearchResult = z.infer<typeof SourceSearchResult>;

/** A live connector (an MCP server) or a dataset a project can read from. */
export const CatalogEntry = z.object({ id: z.string(), name: z.string(), detail: z.string() });
export type CatalogEntry = z.infer<typeof CatalogEntry>;

/** What can be added as a source besides files, links and text: the organisation's connectors and datasets. */
export const SourceCatalog = z.object({ connectors: z.array(CatalogEntry), datasets: z.array(CatalogEntry) });
export type SourceCatalog = z.infer<typeof SourceCatalog>;

/** One source added by hand, from the Add sources menu. */
export const NewSource = z.discriminatedUnion('from', [
  z.strictObject({
    from: z.literal('upload'),
    name: z.string().trim().min(1).max(200),
    size: z.number().int().nonnegative().max(UPLOAD_LIMIT_BYTES, 'Files can be up to 512 KB'),
    /** The file's text, when it has some (Markdown, CSV, JSON, plain text); empty for others. */
    content: z.string().max(UPLOAD_LIMIT_BYTES).default(''),
  }),
  z.strictObject({
    from: z.literal('link'),
    url: z.url({ protocol: /^https?$/, error: 'Enter a web address that starts with http:// or https://' }).max(2000),
  }),
  z.strictObject({ from: z.literal('connector'), id: z.string().min(1).max(80) }),
  z.strictObject({ from: z.literal('dataset'), id: z.string().min(1).max(80) }),
  z.strictObject({
    from: z.literal('paste'),
    title: z.string().trim().max(200).optional(),
    text: z.string().trim().min(1, 'Paste some text').max(20_000),
  }),
]);
export type NewSource = z.infer<typeof NewSource>;

export const OUTPUT_TOOLS = ['brief', 'table', 'faq', 'timeline'] as const;
export const NewOutput = z.strictObject({ tool: z.enum(OUTPUT_TOOLS) });
export type NewOutput = z.infer<typeof NewOutput>;

/** A question asked in the project and Donovan's answer, kept as the project's chat. */
export const ProjectAnswer = z.object({
  id: z.string(),
  question: z.string(),
  answer: CitedText,
  sourcesRead: z.number().int(),
  at: Iso,
  /** In a Calibrated project: each statement labelled by where it comes from (null otherwise). */
  claims: z.array(Claim).nullable(),
  /** In a Calibrated project: what to check before acting on the answer. */
  checkpoint: z.string().nullable(),
});
export type ProjectAnswer = z.infer<typeof ProjectAnswer>;

export const Project = ProjectSummary.extend({
  /** An organisation library: anyone can read it and copy it; nobody edits it here. */
  readOnly: z.boolean(),
  description: z.string(),
  /** Skills, models and servers the project's chats use. */
  attached: z.array(z.string()),
  sharedWith: z.array(ProjectShare),
  sources: z.array(ProjectSource),
  /** Donovan's overview of the selected sources; empty until there are some. */
  guide: CitedText,
  questions: z.array(z.string()),
  notes: z.array(ProjectNote),
  /** Artifacts filed under the project: made by its Studio tools, saved from chats, or uploaded. */
  outputs: z.array(z.object({ artifactId: z.string(), title: z.string(), meta: z.string() })),
  /** Things a search turned up that could be added as sources. */
  suggestions: z.array(ProjectSource.omit({ selected: true })),
  chats: z.array(ChatSummary),
  workflows: z.array(z.object({ name: z.string(), meta: z.string() })),
  /** Questions asked in the project and their answers, oldest first. */
  thread: z.array(ProjectAnswer),
});
export type Project = z.infer<typeof Project>;

export const NewProject = z.strictObject({
  name: z.string().trim().min(1, 'Name the project').max(80),
  sensitivity: Sensitivity.default('Internal'),
  calibrated: z.boolean().default(false),
  /** Start from an organisation library's sources. */
  fromLibrary: z.string().optional(),
});
export type NewProject = z.infer<typeof NewProject>;

export const ProjectPatch = z.strictObject({
  name: z.string().trim().min(1).max(80).optional(),
  sensitivity: Sensitivity.optional(),
  calibrated: z.boolean().optional(),
});
export type ProjectPatch = z.infer<typeof ProjectPatch>;

export const SourceSelection = z.strictObject({ selected: z.boolean() });
export const AllSourcesSelection = SourceSelection;
export type AllSourcesSelection = SourceSelection;
export type SourceSelection = z.infer<typeof SourceSelection>;

export const AddSources = z.strictObject({ sources: z.array(SourceCandidate).min(1).max(20) });
export type AddSources = z.infer<typeof AddSources>;

export const ProjectQuestion = z.strictObject({ question: z.string().trim().min(1).max(2000) });
export type ProjectQuestion = z.infer<typeof ProjectQuestion>;

export const NewNote = z.strictObject({ text: z.string().trim().min(1).max(4000) });
export type NewNote = z.infer<typeof NewNote>;
