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

/** A stack frame as V8 writes it: `    at fn (file:line:col)` or `    at file:line:col`. */
const FRAME = /^ {4}at [^\n]*:\d+:\d+\)?$/;

/**
 * The call frames of an error's stack, with none of its message. The message can run to many lines (a database error
 * lists the query's parameters, which can be anything a person sent, a pasted stack trace included), so rather than
 * dropping its first line, this cuts the stack after the whole message, and keeps only lines shaped like frames. If
 * the message isn't where the stack's header should be (it was changed after the stack was taken), no frames at all.
 */
export function framesOf(error: Error): string | undefined {
  const stack = error.stack;
  if (!stack) return undefined;
  let rest: string;
  if (error.message) {
    const at = stack.indexOf(error.message);
    if (at < 0 || stack.slice(0, at).includes('\n')) return undefined;
    rest = stack.slice(at + error.message.length);
  } else {
    rest = stack.slice(stack.indexOf('\n') + 1);
  }
  const frames = rest.split('\n').filter((line) => FRAME.test(line));
  return frames.length ? frames.slice(0, 7).join('\n') : undefined;
}

/** An error's type, database code and constraint, and the frames of its stack (never its message). */
export function describe(error: unknown): Record<string, string | undefined> {
  if (!(error instanceof Error)) return { error: typeof error };
  const cause = error.cause as { code?: unknown; constraint?: unknown; name?: unknown } | undefined;
  return {
    // The class, when it says more than the name (DrizzleQueryError doesn't set one).
    error: error.constructor.name !== 'Error' ? error.constructor.name : error.name,
    ...(error instanceof HttpException ? { status: String(error.getStatus()) } : {}),
    ...(typeof cause?.code === 'string' ? { dbCode: cause.code } : {}),
    ...(typeof cause?.constraint === 'string' ? { constraint: cause.constraint } : {}),
    stack: framesOf(error),
  };
}
