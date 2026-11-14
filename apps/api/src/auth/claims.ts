import type { JWTPayload } from 'jose';

/** The parts of an access token Donovan uses to know who is calling. */
export interface Claims extends JWTPayload {
  sub: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  preferred_username?: string;
  email?: string;
}

export interface AuthedRequest {
  claims?: Claims;
}
