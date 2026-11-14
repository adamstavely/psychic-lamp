import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthedRequest, Claims as TokenClaims } from './claims.js';

/** The verified access-token claims of the caller. Only on routes behind the AuthGuard. */
export const Claims = createParamDecorator((_: unknown, ctx: ExecutionContext): TokenClaims => {
  const claims = ctx.switchToHttp().getRequest<AuthedRequest>().claims;
  if (!claims) throw new Error('@Claims() used on a public route');
  return claims;
});
