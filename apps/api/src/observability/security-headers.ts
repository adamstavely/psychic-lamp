import type { NextFunction, Request, Response } from 'express';

/**
 * Headers every API response carries. The API serves JSON and event streams only, so it can say so strictly: nothing
 * it returns is to be framed, sniffed as another type, sent on as a referrer, or cached. HSTS is added in production,
 * where the API is only reached over https. (Swagger UI, at /api/docs, needs its own policy and keeps it.)
 */
export function securityHeaders(production: boolean) {
  return (req: Request, res: Response, next: NextFunction): void => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    if (!req.path.startsWith('/api/docs'))
      res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    res.setHeader('Cache-Control', 'no-store');
    if (production) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  };
}
