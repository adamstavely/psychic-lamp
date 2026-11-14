import { z } from 'zod';

const flag = (fallback: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(fallback)
    .transform((v) => v === 'true');

/** Settings that only make sense on a developer's machine or in CI, refused when DONOVAN_ENV is production. */
const LOCAL_ONLY_PASSWORD = /:\/\/[^:/]+:donovan@/;

export const EnvShape = z.object({
  /** development (default), test, or production: production refuses local-only settings at start. */
  DONOVAN_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3870),
  DATABASE_URL: z.url(),
  ELASTICSEARCH_URL: z.url(),
  /** An Elasticsearch API key (the encoded form); required in production. */
  ELASTICSEARCH_API_KEY: z.string().min(1).optional(),
  /** A CA certificate (PEM) to trust for Elasticsearch over TLS, when it isn't signed by a public CA. */
  ELASTICSEARCH_CA_PEM: z.string().min(1).optional(),
  /** The OIDC issuer; its discovery document gives the keys that sign access tokens. */
  OIDC_ISSUER: z.url(),
  /** The audience access tokens must carry for this API. */
  OIDC_AUDIENCE: z.string().min(1).default('donovan-api'),
  /** Scales the pauses in simulated answer streaming: 1 reads like a model writing, 0 sends at once (tests). */
  STREAM_SPEED: z.coerce.number().min(0).max(5).default(1),
  /** Index chats and artifacts search is missing, on start (off in integration tests, which make their own). */
  SEARCH_BACKFILL: flag('true'),
  /** Apply database migrations when the API starts (the default here). Production runs them as a separate job. */
  MIGRATE_ON_START: flag('true'),
  /** Requests one person can make per minute before getting 429 (0 turns the limit off). */
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(0).default(600),
  /** Answers one person can be streamed at once; another send waits for 429 until one finishes. */
  MAX_STREAMS_PER_USER: z.coerce.number().int().min(1).default(3),
  /** Local and CI only: adds DELETE /api/test/me, which wipes the caller's data so end-to-end tests start fresh. */
  ALLOW_TEST_RESET: flag('false'),
});

/**
 * The API's environment. In production it refuses what is only safe locally: the test reset, plain-HTTP identity or
 * search, Elasticsearch without an API key, the local database password, and migrating on start.
 */
export const Env = EnvShape.superRefine((env, ctx) => {
  if (env.DONOVAN_ENV !== 'production') return;
  const refuse = (path: keyof typeof env, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
  if (env.ALLOW_TEST_RESET) refuse('ALLOW_TEST_RESET', 'The test reset is never available in production');
  if (!env.OIDC_ISSUER.startsWith('https://')) refuse('OIDC_ISSUER', 'Production signs in over https');
  if (!env.ELASTICSEARCH_URL.startsWith('https://'))
    refuse('ELASTICSEARCH_URL', 'Production reaches search over https');
  if (!env.ELASTICSEARCH_API_KEY) refuse('ELASTICSEARCH_API_KEY', 'Production authenticates to Elasticsearch');
  if (LOCAL_ONLY_PASSWORD.test(env.DATABASE_URL)) refuse('DATABASE_URL', "That's the local development password");
  if (env.MIGRATE_ON_START) refuse('MIGRATE_ON_START', 'Production migrates in a separate job (npm run migrate)');
  if (env.RATE_LIMIT_PER_MINUTE === 0) refuse('RATE_LIMIT_PER_MINUTE', 'Production keeps a request limit');
});
export type Env = z.infer<typeof Env>;
