import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthedRequest, Claims } from './claims.js';
import { IS_PUBLIC } from './public.decorator.js';
import { TokenVerifier } from './token-verifier.js';

/** Requires a valid bearer token on every route not marked @Public(), and puts its claims on the request. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: TokenVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()])) return true;

    const req = context.switchToHttp().getRequest<Request & AuthedRequest>();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) throw new UnauthorizedException('Sign in to continue');

    try {
      const payload = await this.verifier.verify(token);
      if (typeof payload.sub !== 'string' || !payload.sub) throw new Error('token has no subject');
      req.claims = payload as Claims;
      return true;
    } catch {
      throw new UnauthorizedException('Your session has expired or is not valid. Sign in again.');
    }
  }
}
