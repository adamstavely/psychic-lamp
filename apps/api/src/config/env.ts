import { z } from 'zod';

export const Env = z.object({
  PORT: z.coerce.number().int().positive().default(3870),
  DATABASE_URL: z.url(),
  ELASTICSEARCH_URL: z.url(),
  /** The OIDC issuer; its discovery document gives the keys that sign access tokens. */
  OIDC_ISSUER: z.url(),
  /** The audience access tokens must carry for this API. */
  OIDC_AUDIENCE: z.string().min(1).default('donovan-api'),
  /** Scales the pauses in simulated answer streaming: 1 reads like a model writing, 0 sends at once (tests). */
  STREAM_SPEED: z.coerce.number().min(0).max(5).default(1),
  /** Index chats and artifacts search is missing, on start (off in integration tests, which make their own). */
  SEARCH_BACKFILL: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  /** Local and CI only: adds DELETE /api/test/me, which wipes the caller's data so end-to-end tests start fresh. */
  ALLOW_TEST_RESET: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});
export type Env = z.infer<typeof Env>;
