import type {
  DecisionResult,
  GovernanceQueue,
  NewDecision,
  Policy,
  PolicyId,
  QueueItem,
  RegistryKind,
  ReviewHistory,
  ReviewRisk,
} from '@donovan/contracts';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, eq, gte, or, sql } from 'drizzle-orm';
import { DB, type Db } from '../db/db.module.js';
import { governancePolicies, registryItems, registryReviews, registryRevisions } from '../db/schema.js';
import { authorOf, proposed, seenBy, toSummary } from '../registry/registry-row.js';

type Row = typeof registryItems.$inferSelect;

/** Approvals from different people, none of them the submitter, that publish an item. */
export const APPROVALS_TO_PUBLISH = 2;

const POLICIES: Omit<Policy, 'enabled' | 'updatedBy' | 'updatedAt'>[] = [
  {
    id: 'read-only-default',
    name: 'Read-only by default',
    description: 'Write tools stay off until an admin turns them on.',
    enforced: 'Everything registered starts read-only.',
  },
  {
    id: 'per-tool-approval',
    name: 'Per-tool approval',
    description: 'Each write tool is approved in chat before it runs.',
    enforced: 'Off, write tools in chats run without asking.',
  },
  {
    id: 'confidential-in-workspace',
    name: 'Confidential stays in the workspace',
    description: 'Confidential and Restricted servers and skills are installed only in Donovan chat.',
    enforced: 'Installing them in another client is refused.',
  },
  {
    id: 'restricted-auto-routing',
    name: 'Auto-routing may pick Restricted models',
    description: 'If off, Restricted models are used only when someone picks them.',
    enforced: 'Applies once auto-routing calls real models; it picks no Restricted model today.',
  },
];
const DEFAULTS: Record<PolicyId, boolean> = {
  'read-only-default': true,
  'per-tool-approval': true,
  'confidential-in-workspace': true,
  'restricted-auto-routing': false,
};

/** A Donovan admin may change policies: the identity provider's realm role. */
export const ADMIN_ROLE = 'donovan-admin';

/**
 * Governance: the review queue (two-person review: two approvals from people other than the submitter publish an item;
 * one request for changes or one rejection stops it, and the submitter can resubmit), and the workspace's policies.
 */
@Injectable()
export class GovernanceService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Everything waiting for review, oldest first, with how far along each is and the person's own part in it. An edit of
   * a published item shows as that edit, with the version it would replace.
   */
  async queue(userId: string): Promise<GovernanceQueue> {
    const rows = await this.db
      .select()
      .from(registryItems)
      .where(or(eq(registryItems.status, 'pending'), sql`${registryItems.proposal}->>'status' = 'pending'`));
    const pending = rows.map(proposed).sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());
    const reviews = await this.db.select().from(registryReviews);
    const items: QueueItem[] = pending.map((r) => {
      const round = reviews.filter((v) => v.kind === r.kind && v.itemId === r.id && v.round === r.reviewRound);
      const { risk, why } = riskOf(r);
      return {
        item: toSummary(
          rows.find((row) => row.kind === r.kind && row.id === r.id)!,
          'review',
        ),
        round: r.reviewRound,
        approvals: round.filter((v) => v.decision === 'approve').length,
        submittedAt: r.updatedAt.toISOString(),
        risk,
        why,
        mine: authorOf(r, userId),
        myDecision: round.find((v) => v.reviewerId === userId)?.decision ?? null,
      };
    });
    const day = new Date(Date.now() - 24 * 3600_000);
    const week = new Date(Date.now() - 7 * 24 * 3600_000);
    const [{ today }] = await this.db
      .select({ today: count() })
      .from(registryReviews)
      .where(gte(registryReviews.at, day));
    const [{ published }] = await this.db
      .select({ published: count() })
      .from(registryReviews)
      .innerJoin(
        registryItems,
        and(eq(registryItems.kind, registryReviews.kind), eq(registryItems.id, registryReviews.itemId)),
      )
      .where(
        and(
          eq(registryItems.status, 'published'),
          eq(registryReviews.decision, 'approve'),
          gte(registryReviews.at, week),
          // Count each published item once: its last approval.
          sql`${registryReviews.at} = (select max(r2.at) from registry_reviews r2 where r2.kind = ${registryReviews.kind} and r2.item_id = ${registryReviews.itemId})`,
        ),
      );
    return { items, waiting: items.length, publishedThisWeek: published, decisionsToday: today };
  }

  /**
   * Records a reviewer's decision. The submitter can't review their own submission, a reviewer decides once per round,
   * and decisions take turns on the item, so two second approvals at once publish it once. A decision names the
   * revision it was made on: if the item has changed since, it's refused (409), so an approval from an old screen can't
   * publish a version nobody reviewed. What was decided on is kept as a snapshot, for the history. For an edit of a
   * published item, two approvals put the edit in place of the published version; a rejection or a request for changes
   * leaves the published version as it was.
   */
  async decide(
    userId: string,
    reviewerName: string,
    kind: RegistryKind,
    id: string,
    body: NewDecision,
  ): Promise<DecisionResult> {
    if (body.decision !== 'approve' && !body.note)
      throw new BadRequestException('Say why, so the submitter knows what to change');
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(registryItems)
        .where(and(eq(registryItems.kind, kind), eq(registryItems.id, id)))
        .for('update');
      if (!row) throw new NotFoundException(`No ${kind} with that id`);
      // What's under review: an edit of a published item, or the item itself.
      const item = proposed(row);
      if (item.status !== 'pending') throw new ConflictException(`It isn't waiting for review: it's ${item.status}`);
      if (item.ownerId === userId || item.submittedBy === userId)
        throw new ForbiddenException("You can't review your own submission");
      if (item.revision !== body.revision)
        throw new ConflictException(
          `It changed while you were looking: ${item.version} is waiting now. Reload to review that version.`,
        );
      const inserted = await tx
        .insert(registryReviews)
        .values({
          kind,
          itemId: id,
          round: item.reviewRound,
          revision: item.revision,
          version: item.version,
          reviewerId: userId,
          reviewerName,
          decision: body.decision,
          note: body.note,
        })
        .onConflictDoNothing()
        .returning();
      if (inserted.length === 0) throw new ConflictException('You already reviewed this round');
      await tx
        .insert(registryRevisions)
        .values({
          kind,
          itemId: id,
          revision: item.revision,
          version: item.version,
          name: item.name,
          summary: item.summary,
          sensitivity: item.sensitivity,
          details: item.details,
        })
        .onConflictDoNothing();
      const [{ approvals }] = await tx
        .select({ approvals: count() })
        .from(registryReviews)
        .where(
          and(
            eq(registryReviews.kind, kind),
            eq(registryReviews.itemId, id),
            eq(registryReviews.round, item.reviewRound),
            eq(registryReviews.decision, 'approve'),
          ),
        );
      const status =
        body.decision === 'reject'
          ? 'rejected'
          : body.decision === 'changes'
            ? 'changes-requested'
            : approvals >= APPROVALS_TO_PUBLISH
              ? 'published'
              : 'pending';
      const here = and(eq(registryItems.kind, kind), eq(registryItems.id, id));
      if (status === 'pending') return { status, approvals };
      if (!row.proposal)
        await tx
          .update(registryItems)
          .set({ status, updatedAt: new Date(), searchVersion: sql`${registryItems.searchVersion} + 1` })
          .where(here);
      else if (status === 'published')
        await tx
          .update(registryItems)
          .set({
            name: item.name,
            version: item.version,
            sensitivity: item.sensitivity,
            summary: item.summary,
            details: item.details,
            revision: item.revision,
            proposal: null,
            updatedAt: new Date(),
            // Search re-indexes it on its next reconciliation.
            searchVersion: sql`${registryItems.searchVersion} + 1`,
          })
          .where(here);
      else
        await tx
          .update(registryItems)
          .set({ proposal: { ...row.proposal, status } })
          .where(here);
      return { status, approvals };
    });
  }

  /** The submitter sends it back after changes: a new round, with no decisions in it yet. */
  async resubmit(userId: string, kind: RegistryKind, id: string, summary?: string): Promise<void> {
    const refused = () => new ConflictException('Only your own submission, sent back or rejected, can be resubmitted');
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(registryItems)
        .where(and(eq(registryItems.kind, kind), eq(registryItems.id, id)))
        .for('update');
      const p = row?.proposal;
      if (!row || !authorOf(row, userId) || !['changes-requested', 'rejected'].includes(proposed(row).status))
        throw refused();
      const here = and(eq(registryItems.kind, kind), eq(registryItems.id, id));
      const round = sql`${registryItems.reviewRound} + 1`;
      // An edit of a published item goes back to review as an edit: the published version stays live.
      if (p)
        await tx
          .update(registryItems)
          .set({
            proposal: {
              ...p,
              status: 'pending',
              revision: Math.max(row.revision, p.revision) + 1,
              summary: summary ?? p.summary,
              at: new Date().toISOString(),
            },
            reviewRound: round,
          })
          .where(here);
      else
        await tx
          .update(registryItems)
          .set({
            status: 'pending',
            reviewRound: round,
            revision: sql`${registryItems.revision} + 1`,
            ...(summary ? { summary } : {}),
            updatedAt: new Date(),
            searchVersion: sql`${registryItems.searchVersion} + 1`,
          })
          .where(here);
    });
  }

  /**
   * Every decision on an item, oldest first, for anyone who can see the item (as the registry's visibility: its owner
   * and whoever last sent it to review see it in any state), and whether this person can resubmit it.
   */
  async history(userId: string, kind: RegistryKind, id: string): Promise<ReviewHistory> {
    const [row] = await this.db
      .select()
      .from(registryItems)
      .where(and(eq(registryItems.kind, kind), eq(registryItems.id, id)));
    const theirs = !!row && authorOf(row, userId);
    if (!row || !(['published', 'pending'].includes(row.status) || theirs))
      throw new NotFoundException(`No ${kind} with that id`);
    // Its author sees their edit's status; everyone else, the published version's.
    const status = seenBy(row, userId).shown.status;
    const rows = await this.db
      .select()
      .from(registryReviews)
      .where(and(eq(registryReviews.kind, kind), eq(registryReviews.itemId, id)))
      .orderBy(asc(registryReviews.at));
    return {
      kind,
      id,
      round: row.reviewRound,
      canResubmit: theirs && (status === 'changes-requested' || status === 'rejected'),
      records: rows.map((r) => ({
        round: r.round,
        revision: r.revision,
        version: r.version,
        reviewer: r.reviewerName,
        decision: r.decision,
        note: r.note,
        at: r.at.toISOString(),
      })),
    };
  }

  async policies(): Promise<Policy[]> {
    const rows = await this.db.select().from(governancePolicies);
    return POLICIES.map((p) => {
      const row = rows.find((r) => r.id === p.id);
      return {
        ...p,
        enabled: row?.enabled ?? DEFAULTS[p.id],
        updatedBy: row?.updatedBy ?? null,
        updatedAt: row?.updatedAt.toISOString() ?? null,
      };
    });
  }

  async enabled(id: PolicyId): Promise<boolean> {
    const [row] = await this.db
      .select({ enabled: governancePolicies.enabled })
      .from(governancePolicies)
      .where(eq(governancePolicies.id, id));
    return row?.enabled ?? DEFAULTS[id];
  }

  async setPolicy(id: PolicyId, enabled: boolean, by: string): Promise<Policy> {
    await this.db
      .insert(governancePolicies)
      .values({ id, enabled, updatedBy: by })
      .onConflictDoUpdate({ target: governancePolicies.id, set: { enabled, updatedBy: by, updatedAt: new Date() } });
    return (await this.policies()).find((p) => p.id === id)!;
  }
}

/** How closely to look: Restricted, autonomous or write-without-approval is high; Confidential is medium. */
function riskOf(r: Row): { risk: ReviewRisk; why: string } {
  const d = r.details as Record<string, unknown>;
  if (r.sensitivity === 'Restricted') return { risk: 'high', why: 'Restricted tier.' };
  if (d['autonomy'] === 'Autonomous') return { risk: 'high', why: 'Acts without asking.' };
  if (r.access && !r.access.approval) return { risk: 'high', why: 'Write calls would run without approval.' };
  if (r.sensitivity === 'Confidential') return { risk: 'medium', why: 'Confidential tier.' };
  return { risk: 'low', why: `${r.sensitivity} tier, approval on writes.` };
}
