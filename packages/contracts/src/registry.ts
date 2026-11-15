import { z } from 'zod';
import { Sensitivity } from './chat.js';
import { INSTALL_CLIENTS } from './defaults.js';

type InstallClientId = (typeof INSTALL_CLIENTS)[number]['id'];

/** What Build mode keeps a registry of. */
export const RegistryKind = z.enum([
  'skill',
  'server',
  'agent',
  'workflow',
  'model',
  'dataset',
  'space',
  'collection',
  'prompt',
]);
export type RegistryKind = z.infer<typeof RegistryKind>;

/**
 * Where an item is in review. Published items are what people use; a submission is pending until two people other
 * than its submitter approve it (see docs/slice-2-plan.md), or goes back to its submitter with changes requested, or is
 * rejected.
 */
export const RegistryStatus = z.enum(['draft', 'pending', 'changes-requested', 'published', 'rejected']);
export type RegistryStatus = z.infer<typeof RegistryStatus>;

/** Who an item belongs to: a team (the seeded catalog) or the person who registered it. */
export const RegistryOwner = z.object({
  team: z.string().nullable(),
  /** The owner's user id, when a person owns it. */
  personId: z.string().nullable(),
  /** The team's or the person's name, to show. */
  name: z.string(),
});
export type RegistryOwner = z.infer<typeof RegistryOwner>;

/** An item's id: unique within its kind, and safe in a URL. */
export const RegistryId = z.string().regex(/^[a-z0-9-]{1,80}$/, 'Not a registry id');

const Text = z.string().max(2000);
const Short = z.string().max(200);

const SkillDetails = z.object({
  score: z.number().int().min(0).max(100).nullable(),
  uses: Short,
  principles: z.array(z.object({ title: Short, text: Text })).max(50),
  tests: z.array(z.object({ name: Short, result: z.enum(['pass', 'fail']), note: Text })).max(100),
});

const ToolParam = z.object({ name: Short, type: Short, required: z.boolean(), description: Short });
const ServerTool = z.object({
  name: Short,
  signature: Short,
  description: Text,
  calls: Short,
  /** Changes something outside Donovan, so each call needs approval in chat. */
  write: z.boolean(),
  params: z.array(ToolParam).max(30),
});
const ServerDetails = z.object({
  verified: z.boolean(),
  official: z.boolean(),
  transport: Short,
  auth: Short,
  installs: Short,
  calls: Short,
  source: Short,
  tools: z.array(ServerTool).max(200),
});

const AgentDetails = z.object({
  autonomy: Short,
  model: Short,
  /** Names of the servers and skills it uses. */
  servers: z.array(Short).max(50),
  skills: z.array(Short).max(50),
  runs: Short,
  success: Short,
});

const WorkflowNode = z.object({
  id: Short,
  label: Short,
  kind: z.enum(['Trigger', 'Tool', 'Model', 'Skill', 'Approval']),
  sub: Short,
  x: z.number(),
  y: z.number(),
});
const WorkflowDetails = z.object({
  state: z.enum(['Active', 'Paused', 'Draft']),
  schedule: Short,
  nodes: z.array(WorkflowNode).max(100),
  edges: z.array(z.tuple([Short, Short])).max(300),
});

const Metric = z.object({ value: Short, label: Short });
const ModelDetails = z.object({
  task: Short,
  base: Short,
  context: Short,
  calls: Short,
  verified: z.boolean(),
  metrics: z.array(Metric).max(20),
  files: z.array(z.object({ name: Short, size: Short })).max(100),
  evals: z
    .array(
      z.object({
        suite: Short,
        metric: Short,
        value: Short,
        previous: Short,
        trend: z.enum(['up', 'down', 'flat']),
      }),
    )
    .max(100),
});

const DatasetDetails = z.object({
  rows: Short,
  size: Short,
  format: Short,
  splits: Short,
  usedBy: z.array(Short).max(50),
  pulls: Short,
  updated: Short,
  schema: z.array(z.object({ name: Short, type: Short })).max(500),
});

const SpaceDetails = z.object({
  model: Short,
  visits: Short,
  inputLabel: Short,
  placeholder: Text,
  outputs: z.array(z.object({ label: Short, value: Text })).max(20),
});

const CollectionDetails = z.object({
  members: z.array(z.object({ kind: RegistryKind, name: Short })).max(500),
});

const PromptVersion = z.object({
  version: Short,
  when: Short,
  by: Short,
  note: Short,
  score: z.number().int().min(0).max(100).nullable(),
  system: z.string().max(20_000),
  template: z.string().max(20_000),
});
const PromptDetails = z.object({
  model: Short,
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().int().positive().max(200_000),
  /** Which version (from 1) is published. */
  published: z.number().int().positive(),
  uses: Short,
  tags: z.array(Short).max(20),
  variables: z.record(z.string(), Text),
  versions: z.array(PromptVersion).min(1).max(200),
  /** A sample output per version, by version name. */
  outputs: z.record(z.string(), z.string().max(20_000)),
  tests: z
    .array(
      z.object({
        name: Short,
        vars: Short,
        checks: z.array(Short).max(20),
        results: z.record(z.string(), z.enum(['pass', 'fail'])),
      }),
    )
    .max(100),
});

const Base = z.object({
  id: RegistryId,
  name: z.string().min(1).max(120),
  /** team/name, unique within a kind. */
  slug: z.string().min(1).max(160),
  version: Short,
  sensitivity: Sensitivity,
  summary: Text,
  owner: RegistryOwner,
  status: RegistryStatus,
  updatedAt: z.iso.datetime({ offset: true }),
});

/** An item with everything about it, as its detail page shows it. */
export const RegistryItem = z.discriminatedUnion('kind', [
  Base.extend({ kind: z.literal('skill'), details: SkillDetails }),
  Base.extend({ kind: z.literal('server'), details: ServerDetails }),
  Base.extend({ kind: z.literal('agent'), details: AgentDetails }),
  Base.extend({ kind: z.literal('workflow'), details: WorkflowDetails }),
  Base.extend({ kind: z.literal('model'), details: ModelDetails }),
  Base.extend({ kind: z.literal('dataset'), details: DatasetDetails }),
  Base.extend({ kind: z.literal('space'), details: SpaceDetails }),
  Base.extend({ kind: z.literal('collection'), details: CollectionDetails }),
  Base.extend({ kind: z.literal('prompt'), details: PromptDetails }),
]);
export type RegistryItem = z.infer<typeof RegistryItem>;
export type RegistryDetails<K extends RegistryKind> = Extract<RegistryItem, { kind: K }>['details'];

/** What a catalog card shows beyond the basics, taken from the item's details. */
export const RegistryCard = z.object({
  /** A short state: Verified, Approval on writes, Active, Parquet, Foundation… */
  badge: z.string(),
  badgeTone: z.enum(['ok', 'warn', 'info', 'neutral']),
  /** The line under the name: slug and version, or what stands in for them. */
  meta: z.string(),
  /** Up to three figures: "3 tools", "213k installs". */
  stats: z.array(z.string()).max(3),
  /** What the catalog can filter by (a model's task), if anything. */
  facet: z.string().nullable(),
});
export type RegistryCard = z.infer<typeof RegistryCard>;

/** An item as the catalog lists it: what every kind has and its card, without its details. */
export const RegistrySummary = Base.extend({ kind: RegistryKind, card: RegistryCard });
export type RegistrySummary = z.infer<typeof RegistrySummary>;

/** Mine: what the person owns. Team: what teams own. All: everything they can see. */
export const RegistryScope = z.enum(['mine', 'team', 'all']);
export type RegistryScope = z.infer<typeof RegistryScope>;

export const RegistryQuery = z.object({
  kind: RegistryKind.optional(),
  scope: RegistryScope.default('all'),
  q: z.string().trim().min(1).max(200).optional(),
});
export type RegistryQuery = z.infer<typeof RegistryQuery>;

/** How many items of each kind the person can see, for the Build rail. */
export const RegistryCounts = z.record(RegistryKind, z.number().int().nonnegative());
export type RegistryCounts = z.infer<typeof RegistryCounts>;

/** Arguments for a sandbox run of a server's tool, by parameter name. */
export const TryTool = z.strictObject({
  args: z.record(z.string().max(80), z.string().max(2000)).default({}),
});
export type TryTool = z.infer<typeof TryTool>;

/** What a sandbox run returned: a mock of the tool's real response, so its shape can be seen before using it. */
export const TryResult = z.object({
  status: z.string(),
  durationMs: z.number().int().nonnegative(),
  result: z.string(),
});
export type TryResult = z.infer<typeof TryResult>;

export const InstallClient = z.enum(INSTALL_CLIENTS.map((c) => c.id) as [InstallClientId, ...InstallClientId[]]);
export type InstallClient = z.infer<typeof InstallClient>;

export const NewInstall = z.strictObject({ client: InstallClient });
export type NewInstall = z.infer<typeof NewInstall>;

/** Where the person has installed an item. */
export const RegistryInstall = z.object({ client: InstallClient, at: z.iso.datetime({ offset: true }) });
export type RegistryInstall = z.infer<typeof RegistryInstall>;
