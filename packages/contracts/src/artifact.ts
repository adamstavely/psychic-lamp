import { z } from 'zod';
import { Sensitivity } from './chat.js';
import { UPLOAD_LIMIT_BYTES } from './defaults.js';

const Iso = z.iso.datetime({ offset: true });

export const ArtifactKind = z.enum(['Doc', 'Code', 'Data']);
export type ArtifactKind = z.infer<typeof ArtifactKind>;

/** The version a document block first appeared in, so a reader can see what's new. */
const since = { since: z.number().int().positive().optional() };

export const DocBlock = z.discriminatedUnion('type', [
  z.object({ type: z.literal('heading'), text: z.string(), ...since }),
  z.object({ type: z.literal('paragraph'), text: z.string(), ...since }),
  z.object({ type: z.literal('list'), items: z.array(z.string()).min(1), ...since }),
  z.object({
    type: z.literal('table'),
    columns: z.array(z.string()).min(1),
    rows: z.array(z.array(z.string())),
    /** A cell that breaks a guardrail, as [row, column]. */
    flag: z.tuple([z.number().int(), z.number().int()]).optional(),
    ...since,
  }),
  z.object({
    type: z.literal('bars'),
    items: z.array(z.object({ label: z.string(), value: z.number() })).min(1),
    ...since,
  }),
  z.object({ type: z.literal('facts'), rows: z.array(z.tuple([z.string(), z.string()])).min(1), ...since }),
  z.object({
    type: z.literal('callout'),
    tone: z.enum(['info', 'warning']),
    title: z.string(),
    text: z.string(),
    ...since,
  }),
]);
export type DocBlock = z.infer<typeof DocBlock>;

export const NotebookCell = z.object({ type: z.enum(['markdown', 'code', 'output']), text: z.string() });
export type NotebookCell = z.infer<typeof NotebookCell>;

export const ArtifactBody = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('Doc'), blocks: z.array(DocBlock).min(1) }),
  z.object({ kind: z.literal('Code'), language: z.string(), cells: z.array(NotebookCell).min(1) }),
  z.object({
    kind: z.literal('Data'),
    format: z.enum(['json', 'csv']),
    columns: z.array(z.string()).min(1),
    rows: z.array(z.array(z.string())),
    raw: z.string(),
  }),
]);
export type ArtifactBody = z.infer<typeof ArtifactBody>;

export const ArtifactVersion = z.object({ version: z.number().int().positive(), at: Iso, note: z.string() });
export type ArtifactVersion = z.infer<typeof ArtifactVersion>;

export const ArtifactSummary = z.object({
  id: z.string(),
  name: z.string(),
  kind: ArtifactKind,
  sensitivity: Sensitivity,
  /** The chat that made it, if one did (uploads have none). */
  chat: z.object({ id: z.string(), title: z.string() }).nullable(),
  project: z.string().nullable(),
  version: z.number().int().positive(),
  updatedAt: Iso,
  /** The first lines, for a card. */
  preview: z.string(),
});
export type ArtifactSummary = z.infer<typeof ArtifactSummary>;

export const Artifact = ArtifactSummary.extend({
  owner: z.string(),
  sharedWith: z.array(z.string()),
  versions: z.array(ArtifactVersion).min(1),
  sources: z.array(z.string()),
  body: ArtifactBody,
});
export type Artifact = z.infer<typeof Artifact>;

export const ArtifactQuery = z.object({
  q: z.string().trim().max(200).optional(),
  kind: ArtifactKind.optional(),
});
export type ArtifactQuery = z.infer<typeof ArtifactQuery>;

/** A text file the person adds: Markdown or plain text becomes a Doc, CSV or JSON becomes Data. */
export const ArtifactUpload = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/\.(md|markdown|txt|csv|json)$/i, 'Upload a .md, .txt, .csv or .json file'),
  content: z.string().min(1, 'That file is empty').max(UPLOAD_LIMIT_BYTES, 'Files can be up to 512 KB'),
  sensitivity: Sensitivity.default('Internal'),
});
export type ArtifactUpload = z.infer<typeof ArtifactUpload>;

/** Files an artifact under a project (by id), or takes it out (null). */
export const ArtifactPatch = z.strictObject({ projectId: z.string().min(1).max(64).nullable() });
export type ArtifactPatch = z.infer<typeof ArtifactPatch>;
