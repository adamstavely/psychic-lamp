import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import type { Env } from '../config/env.js';
import { AuthGuard } from './auth.guard.js';
import { OidcTokenVerifier, TokenVerifier } from './token-verifier.js';

@Module({
  providers: [
    {
      provide: TokenVerifier,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new OidcTokenVerifier(config.get('OIDC_ISSUER', { infer: true }), config.get('OIDC_AUDIENCE', { infer: true })),
    },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [TokenVerifier],
})
export class AuthModule {}
