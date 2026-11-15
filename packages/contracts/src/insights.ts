import { z } from 'zod';
import { RegistryKind } from './registry.js';

const Iso = z.iso.datetime({ offset: true });

/**
 * One headline figure, with what it counts, and the same count over the period before (null for a figure that's a
 * running total, such as what's in the registry now).
 */
export const Kpi = z.object({
  label: z.string(),
  value: z.number().int().nonnegative(),
  previous: z.number().int().nonnegative().nullable(),
  detail: z.string(),
});
export type Kpi = z.infer<typeof Kpi>;

/** A count for one name (a model, a server), and its share of the total. */
export const Share = z.object({
  name: z.string(),
  count: z.number().int().nonnegative(),
  share: z.number().min(0).max(1),
});
export type Share = z.infer<typeof Share>;

/**
 * Usage across the workspace over a period, counted from what's stored: chats' turns and answers, the tools they
 * called, write tools waiting for approval, registry installs and reviews. Counts only, never content.
 */
export const Insights = z.object({
  from: Iso,
  to: Iso,
  kpis: z.array(Kpi),
  byModel: z.array(Share),
  byServer: z.array(Share),
  installs: z.array(z.object({ kind: RegistryKind, id: z.string(), name: z.string(), count: z.number().int() })),
});
export type Insights = z.infer<typeof Insights>;
