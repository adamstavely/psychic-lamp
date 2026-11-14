import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

/** Checks an access token's signature, issuer, audience and expiry, and returns its claims. Throws if any check fails. */
export abstract class TokenVerifier {
  abstract verify(token: string): Promise<JWTPayload>;
}

/** Verifies against the issuer's published signing keys, found through its discovery document. */
export class OidcTokenVerifier extends TokenVerifier {
  #keys?: Promise<ReturnType<typeof createRemoteJWKSet>>;

  constructor(
    private readonly issuer: string,
    private readonly audience: string,
  ) {
    super();
  }

  async verify(token: string): Promise<JWTPayload> {
    this.#keys ??= this.discoverKeys().catch((err: unknown) => {
      this.#keys = undefined; // try discovery again on the next request
      throw err;
    });
    const { payload } = await jwtVerify(token, await this.#keys, { issuer: this.issuer, audience: this.audience });
    return payload;
  }

  private async discoverKeys(): Promise<ReturnType<typeof createRemoteJWKSet>> {
    const res = await fetch(`${this.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`);
    if (!res.ok) throw new Error(`OIDC discovery failed: ${res.status}`);
    const { jwks_uri } = (await res.json()) as { jwks_uri: string };
    return createRemoteJWKSet(new URL(jwks_uri));
  }
}
