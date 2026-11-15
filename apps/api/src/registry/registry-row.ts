import type { RegistrySummary } from '@donovan/contracts';
import type { registryItems } from '../db/schema.js';
import { cardFor, type CardInput } from './registry-card.js';

type Row = typeof registryItems.$inferSelect;

/** A registry row as the catalog lists it. Shared by the registry and governance, so neither imports the other. */
export function toSummary(r: Row): RegistrySummary {
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
