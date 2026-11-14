import { BadRequestException, Logger } from '@nestjs/common';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { describe as describeError, framesOf, SafeErrorFilter } from './safe-errors.filter.js';

const SECRET = 'sentinel-7f3a: the merger closes Friday';
/** Pasted text that looks like a stack frame, so a filter that keeps "frame-shaped" lines would keep it. */
const PASTED = `${SECRET}\n    at PRIVATE_PROMPT_SENTINEL (/srv/secret.js:1:1)\nmore of what was pasted`;

function host(req: object) {
  const res = {
    headersSent: false,
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    },
  };
  return {
    res,
    host: { switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }) } as never,
  };
}

/** What the database driver really throws: a message over several lines, the parameters on their own line. */
function dbError(): Error {
  const cause = Object.assign(new Error('duplicate key value violates unique constraint "messages_chat_seq"'), {
    code: '23505',
    constraint: 'messages_chat_seq',
  });
  return new DrizzleQueryError(
    'insert into "messages"\n  ("chat_id", "seq", "body")\nvalues ($1, $2, $3)',
    [1, 'chat', PASTED],
    cause,
  );
}

describe('SafeErrorFilter', () => {
  afterEach(() => vi.restoreAllMocks());

  it('logs the error code and request id, never what was sent', () => {
    const logged: string[] = [];
    vi.spyOn(Logger.prototype, 'error').mockImplementation((m: unknown) => void logged.push(String(m)));
    const { res, host: h } = host({
      id: 'req-12345678',
      method: 'POST',
      baseUrl: '',
      path: '/api/chats/abc123/messages',
      route: { path: '/api/chats/:chatId/messages' },
      body: { text: SECRET },
    });
    new SafeErrorFilter().catch(dbError(), h);

    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain(SECRET);
    expect(res.body).toMatchObject({ requestId: 'req-12345678' });
    expect(logged).toHaveLength(1);
    expect(logged[0]).not.toContain(SECRET);
    expect(logged[0]).not.toContain('PRIVATE_PROMPT_SENTINEL');
    expect(logged[0]).not.toContain('Failed query');
    expect(logged[0]).not.toContain('params');
    expect(JSON.parse(logged[0]!)).toMatchObject({
      requestId: 'req-12345678',
      route: '/api/chats/:chatId/messages',
      error: 'DrizzleQueryError',
      dbCode: '23505',
      constraint: 'messages_chat_seq',
    });
  });

  it('answers expected errors as usual, without logging them', () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { res, host: h } = host({ id: 'req-12345678', method: 'POST', path: '/api/x' });
    new SafeErrorFilter().catch(new BadRequestException('Write a message first'), h);
    expect(res.statusCode).toBe(400);
    expect(error).not.toHaveBeenCalled();
  });

  describe('the stack', () => {
    it("keeps a database error's frames and none of its message", () => {
      const stack = describeError(dbError()).stack!;
      expect(stack).toMatch(/^ {4}at /);
      expect(stack).not.toContain(SECRET);
      expect(stack).not.toContain('PRIVATE_PROMPT_SENTINEL');
      expect(stack).not.toContain('values');
    });

    it('cuts a multi-line message whole', () => {
      const frames = framesOf(new Error(`line one\n${PASTED}`))!;
      expect(frames).toMatch(/^ {4}at /);
      expect(frames).not.toContain('PRIVATE_PROMPT_SENTINEL');
    });

    it('gives no frames when the message was changed after the stack was taken', () => {
      const e = new Error('placeholder');
      void e.stack; // V8 writes the stack on first read; after this it keeps the old message
      e.message = PASTED;
      expect(framesOf(e)).toBeUndefined();
    });
  });
});
