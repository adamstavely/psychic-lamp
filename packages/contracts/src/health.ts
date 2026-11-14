import { z } from 'zod';

export const DependencyStatus = z.enum(['up', 'down']);
export type DependencyStatus = z.infer<typeof DependencyStatus>;

export const Health = z.object({
  status: z.enum(['ok', 'degraded']),
  version: z.string(),
  checks: z.object({ postgres: DependencyStatus, elasticsearch: DependencyStatus }),
});
export type Health = z.infer<typeof Health>;
