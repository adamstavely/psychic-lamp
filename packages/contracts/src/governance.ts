import { z } from 'zod';
import { RegistryKind, RegistrySummary } from './registry.js';

const Iso = z.iso.datetime({ offset: true });

/** A reviewer's call on a submission. Two approvals publish it; one request for changes or one rejection stops it. */
export const ReviewDecision = z.enum(['approve', 'changes', 'reject']);
export type ReviewDecision = z.infer<typeof ReviewDecision>;

export const NewDecision = z.strictObject({
  /** The revision the reviewer looked at. If it has changed since, the decision is refused: they review the new one. */
  revision: z.number().int().positive(),
  decision: ReviewDecision,
  /** Required when asking for changes or rejecting, so the submitter knows why. */
  note: z.string().trim().max(1000).default(''),
});
export type NewDecision = z.infer<typeof NewDecision>;

/** One decision, kept for good: who, when, in which round of review, on which version, and why. */
export const ReviewRecord = z.object({
  round: z.number().int().positive(),
  /** The revision and version decided on; null for decisions recorded before revisions were. */
  revision: z.number().int().positive().nullable(),
  version: z.string().nullable(),
  reviewer: z.string(),
  decision: ReviewDecision,
  note: z.string(),
  at: Iso,
});
export type ReviewRecord = z.infer<typeof ReviewRecord>;

/** How closely reviewers should look, from the tier and what it can do. */
export const ReviewRisk = z.enum(['low', 'medium', 'high']);
export type ReviewRisk = z.infer<typeof ReviewRisk>;

/** A submission waiting for review, as the queue shows it. */
export const QueueItem = z.object({
  item: RegistrySummary,
  round: z.number().int().positive(),
  /** Approvals so far in this round; two publish it. */
  approvals: z.number().int().nonnegative(),
  submittedAt: Iso,
  risk: ReviewRisk,
  /** Why that risk, in a sentence. */
  why: z.string(),
  /** The person's own submission, which they can't review. */
  mine: z.boolean(),
  /** What the person already decided this round, if they did. */
  myDecision: ReviewDecision.nullable(),
});
export type QueueItem = z.infer<typeof QueueItem>;

export const GovernanceQueue = z.object({
  items: z.array(QueueItem),
  waiting: z.number().int().nonnegative(),
  publishedThisWeek: z.number().int().nonnegative(),
  decisionsToday: z.number().int().nonnegative(),
});
export type GovernanceQueue = z.infer<typeof GovernanceQueue>;

/** After a decision: the item's status now, and how many approvals it has. */
export const DecisionResult = z.object({
  status: z.enum(['pending', 'changes-requested', 'published', 'rejected']),
  approvals: z.number().int().nonnegative(),
});
export type DecisionResult = z.infer<typeof DecisionResult>;

/** Sends a submission back to review after changes: a new round, with no decisions yet. */
export const Resubmit = z.strictObject({
  summary: z.string().trim().min(1).max(600).optional(),
});
export type Resubmit = z.infer<typeof Resubmit>;

export const PolicyId = z.enum([
  'read-only-default',
  'per-tool-approval',
  'confidential-in-workspace',
  'restricted-auto-routing',
]);
export type PolicyId = z.infer<typeof PolicyId>;

/** A workspace-wide rule. Anyone can see them; only a Donovan admin can change them. */
export const Policy = z.object({
  id: PolicyId,
  name: z.string(),
  description: z.string(),
  /** Where it's enforced, in a sentence. */
  enforced: z.string(),
  enabled: z.boolean(),
  updatedBy: z.string().nullable(),
  updatedAt: Iso.nullable(),
});
export type Policy = z.infer<typeof Policy>;

export const PolicyList = z.object({ policies: z.array(Policy), canChange: z.boolean() });
export type PolicyList = z.infer<typeof PolicyList>;

export const PolicyPatch = z.strictObject({ enabled: z.boolean() });
export type PolicyPatch = z.infer<typeof PolicyPatch>;

/** The review path of one item, for its page. */
export const ReviewHistory = z.object({
  kind: RegistryKind,
  id: z.string(),
  round: z.number().int().positive(),
  /** Whether the person asking can resubmit it: it's sent back or rejected, and theirs or sent to review by them. */
  canResubmit: z.boolean(),
  records: z.array(ReviewRecord),
});
export type ReviewHistory = z.infer<typeof ReviewHistory>;
