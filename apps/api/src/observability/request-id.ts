import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/** A request's id: the caller's (from a proxy or the web app) when it looks like one, else a new one. */
const SAFE_ID = /^[A-Za-z0-9-]{8,64}$/;

declare module 'express' {
  interface Request {
    /** Set on every request; echoed in the x-request-id header and in error responses and logs. */
    id?: string;
  }
}

/** Gives every request an id, so an error a person reports can be found in the logs without logging what they sent. */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const given = req.header('x-request-id');
  req.id = given && SAFE_ID.test(given) ? given : randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
}
