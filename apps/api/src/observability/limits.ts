import { type CanActivate, type ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { AuthedRequest } from '../auth/claims.js';
import type { Env } from '../config/env.js';

const WINDOW_MS = 60_000;

/**
 * A per-person request budget: RATE_LIMIT_PER_MINUTE requests in any minute (by signed-in subject, or by address before
 * sign-in), then 429 with Retry-After. It's per instance and in memory, which is enough for a small pilot behind one
 * or two instances; a larger deployment would keep the counts in a shared store.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  readonly #limit: number;
  readonly #hits = new Map<string, number[]>();

  constructor(config: ConfigService<Env, true>) {
    this.#limit = config.get('RATE_LIMIT_PER_MINUTE', { infer: true });
  }

  canActivate(context: ExecutionContext): boolean {
    if (this.#limit === 0) return true;
    const req = context.switchToHttp().getRequest<Request & AuthedRequest>();
    if (req.path.startsWith('/api/health')) return true;
    const key = req.claims?.sub ? `sub:${req.claims.sub}` : `ip:${req.ip ?? 'unknown'}`;
    const now = Date.now();
    const recent = (this.#hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
    if (recent.length >= this.#limit) {
      const retry = Math.ceil((WINDOW_MS - (now - recent[0]!)) / 1000);
      context.switchToHttp().getResponse<Response>().setHeader('Retry-After', String(retry));
      throw new HttpException('Too many requests. Try again in a moment.', HttpStatus.TOO_MANY_REQUESTS);
    }
    recent.push(now);
    this.#hits.set(key, recent);
    if (this.#hits.size > 10_000) this.#sweep(now);
    return true;
  }

  #sweep(now: number): void {
    for (const [key, times] of this.#hits) if (times.every((t) => now - t >= WINDOW_MS)) this.#hits.delete(key);
  }
}

/** How many answers each person is being streamed; a send over MAX_STREAMS_PER_USER is refused before it's saved. */
@Injectable()
export class StreamLimiter {
  readonly #max: number;
  readonly #active = new Map<string, number>();

  constructor(config: ConfigService<Env, true>) {
    this.#max = config.get('MAX_STREAMS_PER_USER', { infer: true });
  }

  /** Takes a slot for one stream, or refuses with 429; call the returned function when the stream ends. */
  acquire(userId: string): () => void {
    const n = this.#active.get(userId) ?? 0;
    if (n >= this.#max)
      throw new HttpException(
        'Donovan is already answering you in other chats. Try again when one finishes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    this.#active.set(userId, n + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const left = (this.#active.get(userId) ?? 1) - 1;
      if (left > 0) this.#active.set(userId, left);
      else this.#active.delete(userId);
    };
  }
}
