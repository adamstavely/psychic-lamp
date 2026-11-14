import { z } from 'zod';

const Iso = z.iso.datetime({ offset: true });

/** How sensitive a chat, tool call or artifact is; it decides who sees it and which tools need approval. */
export const Sensitivity = z.enum(['Public', 'Internal', 'Confidential', 'Restricted']);
export type Sensitivity = z.infer<typeof Sensitivity>;

/** What auto-routing picked for an answer: the model, and any skill, server, dataset or workflow it used. */
export const Route = z.object({
  kind: z.enum(['model', 'skill', 'server', 'dataset', 'flow']),
  name: z.string(),
});
export type Route = z.infer<typeof Route>;

export const ToolStatus = z.enum(['running', 'done', 'pending', 'denied', 'error']);
export type ToolStatus = z.infer<typeof ToolStatus>;

export const ClaimSource = z.object({
  title: z.string(),
  publisher: z.string(),
  match: z.enum(['Strong match', 'Partial match', 'Weak match']),
  passage: z.string(),
});
export type ClaimSource = z.infer<typeof ClaimSource>;

/** One statement in a Calibrated answer, labelled by where it comes from. */
export const Claim = z.object({
  id: z.string(),
  /** grounded: a retrieved source says it · inferred: reasoned from other claims · model: training knowledge only */
  kind: z.enum(['grounded', 'inferred', 'model']),
  confidence: z.enum(['high', 'medium', 'low']),
  text: z.string(),
  topic: z.string(),
  source: ClaimSource.nullable(),
  note: z.string().nullable(),
  /** For model knowledge: when that knowledge ends. */
  cutoff: z.string().nullable(),
  /** The reader's verdict on it, if they gave one. */
  review: z.enum(['confirmed', 'disputed']).nullable(),
});
export type Claim = z.infer<typeof Claim>;

export const TextBlock = z.object({ type: z.literal('text'), text: z.string() });
export const ListBlock = z.object({ type: z.literal('list'), items: z.array(z.string()).min(1) });
export const ToolBlock = z.object({
  type: z.literal('tool'),
  id: z.string(),
  name: z.string(),
  server: z.string(),
  status: ToolStatus,
  summary: z.string(),
  sensitivity: Sensitivity,
  /** A write tool: it changes something outside Donovan, so it may need approval first. */
  write: z.boolean(),
  durationMs: z.number().int().nonnegative().nullable(),
  args: z.record(z.string(), z.string()),
  result: z.string().nullable(),
});
export const SkillBlock = z.object({
  type: z.literal('skill'),
  name: z.string(),
  version: z.string(),
  note: z.string(),
});
export const ClaimsBlock = z.object({ type: z.literal('claims'), items: z.array(Claim).min(1) });
export const TableBlock = z.object({
  type: z.literal('table'),
  columns: z.array(z.string()).min(1),
  rows: z.array(z.array(z.string())),
});
export const ChartBlock = z.object({
  type: z.literal('chart'),
  title: z.string(),
  bars: z.array(z.object({ label: z.string(), value: z.number(), display: z.string() })).min(1),
});
export const CodeBlock = z.object({ type: z.literal('code'), language: z.string(), text: z.string() });
export const ArtifactBlock = z.object({
  type: z.literal('artifact'),
  artifactId: z.string(),
  name: z.string(),
  kind: z.enum(['Doc', 'Code', 'Data']),
  meta: z.string(),
});
export const StepStatus = z.enum(['done', 'active', 'awaiting', 'pending']);
export const StepsBlock = z.object({
  type: z.literal('steps'),
  title: z.string(),
  items: z.array(z.object({ label: z.string(), status: StepStatus })).min(1),
});
export const WorkflowBlock = z.object({
  type: z.literal('workflow'),
  name: z.string(),
  status: z.string(),
  steps: z.array(z.object({ label: z.string(), status: StepStatus })).min(1),
});

export const Block = z.discriminatedUnion('type', [
  TextBlock,
  ListBlock,
  ToolBlock,
  SkillBlock,
  ClaimsBlock,
  TableBlock,
  ChartBlock,
  CodeBlock,
  ArtifactBlock,
  StepsBlock,
  WorkflowBlock,
]);
export type Block = z.infer<typeof Block>;
export type BlockOf<T extends Block['type']> = Extract<Block, { type: T }>;

export const UserMessage = z.object({
  id: z.string(),
  role: z.literal('user'),
  text: z.string(),
  at: Iso,
});
export type UserMessage = z.infer<typeof UserMessage>;

/** One way Donovan answered; Regenerate adds another. */
export const AnswerVersion = z.object({
  routing: z.array(Route),
  blocks: z.array(Block),
  durationMs: z.number().int().nonnegative(),
});
export type AnswerVersion = z.infer<typeof AnswerVersion>;

export const AssistantMessage = z.object({
  id: z.string(),
  role: z.literal('assistant'),
  /** Every version of the answer, oldest first; routing, blocks and durationMs are the one shown. */
  versions: z.array(AnswerVersion).min(1),
  /** Which version is shown, from 1. */
  version: z.number().int().positive(),
  routing: z.array(Route),
  blocks: z.array(Block),
  /** How long the answer took, for "Worked for 8.6s". */
  durationMs: z.number().int().nonnegative(),
  /** The reader's thumbs up or down. */
  vote: z.enum(['up', 'down']).nullable(),
  at: Iso,
});
export type AssistantMessage = z.infer<typeof AssistantMessage>;

export const Message = z.discriminatedUnion('role', [UserMessage, AssistantMessage]);
export type Message = z.infer<typeof Message>;

/** What a Calibrated session is for, so answers can be weighed against it. */
export const SessionIntent = z.object({
  task: z.string(),
  decision: z.string(),
  consequence: z.string(),
});
export type SessionIntent = z.infer<typeof SessionIntent>;

export const ChatSummary = z.object({
  id: z.string(),
  title: z.string(),
  project: z.string().nullable(),
  sensitivity: Sensitivity,
  pinned: z.boolean(),
  calibrated: z.boolean(),
  updatedAt: Iso,
});
export type ChatSummary = z.infer<typeof ChatSummary>;

/** One part of what the last answer was given to read, in tokens. */
export const ContextPart = z.object({ label: z.string(), tokens: z.number().int().nonnegative() });
export type ContextPart = z.infer<typeof ContextPart>;

/** A Calibrated session's answer to "which claim will you verify, and how?" */
export const Checkpoint = z.object({ claimId: z.string(), method: z.string(), at: Iso });
export type Checkpoint = z.infer<typeof Checkpoint>;

export const Chat = ChatSummary.extend({
  intent: SessionIntent.nullable(),
  messages: z.array(Message),
  /** The context window behind the latest answer. */
  context: z.object({ model: z.string(), limit: z.number().int().positive(), parts: z.array(ContextPart) }),
  checkpoints: z.array(Checkpoint),
});
export type Chat = z.infer<typeof Chat>;

export const ChatPatch = z.strictObject({
  title: z.string().trim().min(1).max(120).optional(),
  pinned: z.boolean().optional(),
});
export type ChatPatch = z.infer<typeof ChatPatch>;

/** The models a person can pin a message to; "auto" lets routing pick. */
export const MODELS = ['claude-sonnet-4.5', 'claude-opus-4.1', 'claude-haiku-4.5'] as const;
export const ModelChoice = z.enum(['auto', ...MODELS]);
export type ModelChoice = z.infer<typeof ModelChoice>;

export const SendMessage = z.strictObject({
  text: z.string().trim().min(1, 'Write a message first').max(8000),
  model: ModelChoice.default('auto'),
  /** Chosen by the client for each message; a retry with the same id returns the turn already saved. */
  requestId: z.uuid().optional(),
});
export type SendMessage = z.infer<typeof SendMessage>;

export const NewChat = z.strictObject({
  /** The first message; the chat is titled from it. */
  text: z.string().trim().min(1).max(8000),
  sensitivity: Sensitivity.default('Internal'),
});
export type NewChat = z.infer<typeof NewChat>;

/**
 * What the answer stream sends, in order: the saved user turn, the answer's start, each block as it arrives (a block is
 * sent again when it changes, e.g. a tool call finishing), text as it's written, and the finished answer.
 */
export const StreamEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('user'), message: UserMessage }),
  z.object({ type: z.literal('start'), id: z.string(), routing: z.array(Route), at: Iso }),
  z.object({ type: z.literal('block'), index: z.number().int().nonnegative(), block: Block }),
  z.object({ type: z.literal('delta'), index: z.number().int().nonnegative(), text: z.string() }),
  z.object({ type: z.literal('done'), message: AssistantMessage }),
  z.object({ type: z.literal('error'), message: z.string() }),
]);
export type StreamEvent = z.infer<typeof StreamEvent>;

export const ToolDecision = z.strictObject({
  decision: z.enum(['approve', 'deny']),
  /** Approve this tool without asking for the rest of the chat. */
  always: z.boolean().default(false),
});
export type ToolDecision = z.infer<typeof ToolDecision>;

/** The chat's turns after a decision: the tool's message updated, and Donovan's reply to it. */
export const ToolDecisionResult = z.object({ updated: AssistantMessage, reply: AssistantMessage });
export type ToolDecisionResult = z.infer<typeof ToolDecisionResult>;

export const Vote = z.strictObject({
  vote: z.enum(['up', 'down']).nullable(),
  /** For a thumbs down: what went wrong. */
  reason: z.string().max(200).optional(),
});
export type Vote = z.infer<typeof Vote>;

export const ClaimReview = z.strictObject({ review: z.enum(['confirmed', 'disputed']).nullable() });
export type ClaimReview = z.infer<typeof ClaimReview>;

export const NewCheckpoint = z.strictObject({
  claimId: z.string().min(1).max(64),
  method: z.string().trim().min(3, 'Say how you will check it').max(500),
});
export type NewCheckpoint = z.infer<typeof NewCheckpoint>;

/** Everything a reviewer needs to see how an answer was produced: settings, routing, sources and the reader's checks. */
export const ProvenanceManifest = z.object({
  format: z.literal('donovan.provenance/v1'),
  exportedAt: Iso,
  exportedBy: z.string(),
  chat: ChatSummary.extend({ intent: SessionIntent.nullable() }),
  settings: z.array(z.object({ label: z.string(), value: z.string() })),
  routing: z.array(Route),
  sources: z.array(z.object({ id: z.string(), label: z.string(), detail: z.string() })),
  claims: z.array(Claim),
  checkpoints: z.array(Checkpoint),
  messages: z.array(Message),
  /** sha256 of the messages as exported, so a copy can be checked against the original. */
  contentHash: z.string(),
});
export type ProvenanceManifest = z.infer<typeof ProvenanceManifest>;

export const RegenerateAnswer = z.strictObject({ model: ModelChoice.default('auto') });
export type RegenerateAnswer = z.infer<typeof RegenerateAnswer>;

export const ShowVersion = z.strictObject({ version: z.number().int().positive() });
export type ShowVersion = z.infer<typeof ShowVersion>;
