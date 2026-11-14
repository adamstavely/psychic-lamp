import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RateLimitGuard, StreamLimiter } from './limits.js';

/** Request and streaming limits for every route (imported after AuthModule, so the limit knows who's calling). */
@Global()
@Module({
  providers: [StreamLimiter, { provide: APP_GUARD, useClass: RateLimitGuard }],
  exports: [StreamLimiter],
})
export class ObservabilityModule {}
