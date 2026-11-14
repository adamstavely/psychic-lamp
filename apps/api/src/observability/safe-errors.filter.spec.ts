import { BadRequestException, Logger } from '@nestjs/common';
import { SafeErrorFilter } from './safe-errors.filter.js';

const SECRET = 'sentinel-7f3a: the merger closes Friday';

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

/** What the database driver throws: the message names the query and its parameters. */
function dbError(): Error {
  const cause = Object.assign(new Error('duplicate key value violates unique constraint "messages_chat_seq"'), {
    code: '23505',
    constraint: 'messages_chat_seq',
  });
  const e = new Error(`Failed query: insert into "messages" ... params: 1,chat,${SECRET}`, { cause });
  e.name = 'DrizzleQueryError';
  return e;
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
    expect(logged[0]).not.toContain('Failed query');
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
});
