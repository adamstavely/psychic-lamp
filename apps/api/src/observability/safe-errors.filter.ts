import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * The last word on errors. A request that fails unexpectedly gets a plain 500 with its request id, and the log gets
 * what an operator needs (the request id, route, error type, database error code, stack) and nothing a person sent:
 * no error message (a database error's message carries the query's parameters, which can be a whole chat message),
 * no SQL, no body, no headers. Expected errors (4xx) answer as usual and aren't logged.
 */
@Catch()
export class SafeErrorFilter implements ExceptionFilter {
  readonly #log = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const requestId = req.id;

    if (exception instanceof HttpException && exception.getStatus() < 500) {
      if (!res.headersSent) res.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    this.#log.error(JSON.stringify({ requestId, method: req.method, route: routeOf(req), ...describe(exception) }));
    if (res.headersSent) {
      res.end();
      return;
    }
    res.status(500).json({ statusCode: 500, message: 'Something went wrong. Try again in a moment.', requestId });
  }
}

/** The route as declared (`/api/chats/:chatId/messages`), not the URL, which can carry ids and queries. */
function routeOf(req: Request): string {
  const route = (req.route as { path?: string } | undefined)?.path;
  return route ? `${req.baseUrl}${route}` : req.path.replace(/\/[^/]*\d[^/]*/g, '/:id');
}

/** An error's type, database code and constraint, and its stack without the message line. */
export function describe(error: unknown): Record<string, string | undefined> {
  if (!(error instanceof Error)) return { error: typeof error };
  const cause = error.cause as { code?: unknown; constraint?: unknown; name?: unknown } | undefined;
  return {
    error: error.name,
    ...(error instanceof HttpException ? { status: String(error.getStatus()) } : {}),
    ...(typeof cause?.code === 'string' ? { dbCode: cause.code } : {}),
    ...(typeof cause?.constraint === 'string' ? { constraint: cause.constraint } : {}),
    // Frames only: the first line repeats the message.
    stack: error.stack?.split('\n').slice(1, 8).join('\n'),
  };
}
