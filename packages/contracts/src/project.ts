import { z } from 'zod';
import { ChatSummary, Sensitivity } from './chat.js';

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

export const Project = ProjectSummary.extend({
  description: z.string(),
  sources: z.array(ProjectSource),
  /** Donovan's overview of the selected sources; empty until there are some. */
  guide: CitedText,
  questions: z.array(z.string()),
  notes: z.array(ProjectNote),
  outputs: z.array(z.object({ title: z.string(), meta: z.string() })),
  /** Things a search turned up that could be added as sources. */
  suggestions: z.array(ProjectSource.omit({ selected: true })),
  chats: z.array(ChatSummary),
  workflows: z.array(z.object({ name: z.string(), meta: z.string() })),
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
export type SourceSelection = z.infer<typeof SourceSelection>;

export const AddSources = z.strictObject({ ids: z.array(z.string()).min(1).max(20) });
export type AddSources = z.infer<typeof AddSources>;

export const ProjectQuestion = z.strictObject({ question: z.string().trim().min(1).max(2000) });
export type ProjectQuestion = z.infer<typeof ProjectQuestion>;

export const ProjectAnswer = z.object({ question: z.string(), answer: CitedText, sourcesRead: z.number().int() });
export type ProjectAnswer = z.infer<typeof ProjectAnswer>;

export const NewNote = z.strictObject({ text: z.string().trim().min(1).max(4000) });
export type NewNote = z.infer<typeof NewNote>;
