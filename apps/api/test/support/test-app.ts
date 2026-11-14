import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { generateKeyPair, jwtVerify, SignJWT, type JWTPayload } from 'jose';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../../src/app.module.js';
import { TokenVerifier } from '../../src/auth/token-verifier.js';
import { runMigrations } from '../../src/db/migrate.js';
import { setUp } from '../../src/setup.js';

// The Docker Compose services (and CI's service containers) on their usual ports, unless the environment says otherwise.
process.env['DATABASE_URL'] ??= 'postgres://donovan:donovan@localhost:5433/donovan';
process.env['ELASTICSEARCH_URL'] ??= 'http://localhost:9201';
process.env['OIDC_ISSUER'] ??= 'http://issuer.test/realms/donovan';
process.env['OIDC_AUDIENCE'] ??= 'donovan-api';

const ISSUER = process.env['OIDC_ISSUER'];
const AUDIENCE = process.env['OIDC_AUDIENCE'];

export interface TestApp {
  app: INestApplication;
  /** A signed access token for a fresh test person (a new subject each call unless one is given). */
  token(claims?: Partial<JWTPayload> & Record<string, unknown>): Promise<string>;
}

/** The real app on the real stores, with tokens signed by a key made for this run instead of Keycloak. */
export async function createTestApp(): Promise<TestApp> {
  await runMigrations(process.env['DATABASE_URL']!);
  const { publicKey, privateKey } = await generateKeyPair('RS256');

  const verifier: TokenVerifier = {
    verify: async (token) => (await jwtVerify(token, publicKey, { issuer: ISSUER, audience: AUDIENCE })).payload,
  };
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(TokenVerifier)
    .useValue(verifier)
    .compile();
  const app = setUp(moduleRef.createNestApplication());
  await app.init();

  return {
    app,
    token: (claims = {}) =>
      new SignJWT({ name: 'Test Person', given_name: 'Test', ...claims })
        .setProtectedHeader({ alg: 'RS256' })
        .setSubject((claims.sub as string | undefined) ?? `test-${randomUUID()}`)
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey),
  };
}
