import { z } from 'zod';

export const Env = z.object({
  PORT: z.coerce.number().int().positive().default(3200),
  DATABASE_URL: z.url(),
  ELASTICSEARCH_URL: z.url(),
  /** The OIDC issuer; its discovery document gives the keys that sign access tokens. */
  OIDC_ISSUER: z.url(),
  /** The audience access tokens must carry for this API. */
  OIDC_AUDIENCE: z.string().min(1).default('donovan-api'),
});
export type Env = z.infer<typeof Env>;
