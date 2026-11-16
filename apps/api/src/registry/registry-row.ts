import type { RegistrySummary } from '@donovan/contracts';
import type { registryItems } from '../db/schema.js';
import { cardFor, type CardInput } from './registry-card.js';

type Row = typeof registryItems.$inferSelect;

/**
 * Who's looking at a row: a person (by id), a reviewer in the queue, or nobody in particular (what's published). An edit
 * of a published item (its proposal) is shown to its submitter, the item's owner and reviewers; everyone else, and
 * anything that uses the item, gets the published version.
 */
export type Viewer = string | 'review' | null;

/** The person owns the item or sent its latest version to review. */
export function authorOf(r: Row, userId: string): boolean {
  return r.ownerId === userId || r.submittedBy === userId;
}

/** The row with its proposal, if it has one, in place of the published version: what its author and reviewers see. */
export function proposed(r: Row): Row {
  const p = r.proposal;
  if (!p) return r;
  return {
    ...r,
    name: p.name,
    version: p.version,
    sensitivity: p.sensitivity,
    summary: p.summary,
    details: p.details,
    status: p.status,
    revision: p.revision,
    updatedAt: new Date(p.at),
  };
}

/** The version of a row the viewer sees: its proposal (for its author or a reviewer), or what's published. */
export function seenBy(r: Row, viewer: Viewer): { shown: Row; live: string | null; inReview: string | null } {
  const edit = !!r.proposal && viewer !== null && (viewer === 'review' || authorOf(r, viewer));
  if (edit) return { shown: proposed(r), live: r.version, inReview: null };
  return { shown: r, live: null, inReview: r.proposal?.status === 'pending' ? r.proposal.version : null };
}

/**
 * A registry row as the catalog lists it, as the viewer sees it. Shared by the registry and governance, so neither
 * imports the other.
 */
export function toSummary(row: Row, viewer: Viewer): RegistrySummary {
  const { shown: r, live, inReview } = seenBy(row, viewer);
  return {
    kind: r.kind,
    id: r.id,
    name: r.name,
    slug: r.slug,
    version: r.version,
    sensitivity: r.sensitivity,
    summary: r.summary,
    owner: { team: r.ownerTeam, personId: r.ownerId, name: r.ownerName },
    status: r.status,
    access: r.access ?? null,
    revision: r.revision,
    liveVersion: live,
    editInReview: inReview,
    updatedAt: r.updatedAt.toISOString(),
    // A row's details belong to its kind (checked on the way in), which the table's types can't say.
    card: cardFor({
      kind: r.kind,
      details: r.details,
      slug: r.slug,
      version: r.version,
      status: r.status,
    } as CardInput),
  };
}
