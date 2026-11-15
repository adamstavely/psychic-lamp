import { HttpEventType, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { AssistantMessage, UserMessage } from '@donovan/contracts';
import { ChatsStore } from '../../core/chats-store';
import { SendFailed, ThreadStore } from './thread-store';

const at = '2026-11-14T10:00:00.000Z';
const user = (id: string, text: string): UserMessage => ({ id, role: 'user', text, at });
const answer = (id: string): AssistantMessage => {
  const v = { routing: [], blocks: [{ type: 'text' as const, text: 'From chat A' }], durationMs: 1000 };
  return { id, role: 'assistant', ...v, versions: [v], version: 1, vote: null, at };
};
const sse = (...events: object[]) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');

describe('ThreadStore', () => {
  let store: ThreadStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ThreadStore,
        { provide: ChatsStore, useValue: { list: { reload: () => undefined } } },
      ],
    });
    store = TestBed.inject(ThreadStore);
    http = TestBed.inject(HttpTestingController);
  });

  /** Lets the chat's own GET through, empty, so only the requests under test are left. */
  const loaded = (chatId: string) => {
    TestBed.tick();
    http
      .match(`/api/chats/${chatId}`)
      .forEach((r) => r.flush({ id: chatId, title: chatId, messages: [], intent: null, checkpoints: [] }));
  };

  it('keeps a late answer from the last chat out of the next one, and cancels its stream', async () => {
    store.open('a');
    loaded('a');
    const sending = store.send('Hello from A', 'auto');
    const req = http.expectOne((r) => r.url === '/api/chats/a/messages');
    expect(req.request.body).toMatchObject({ text: 'Hello from A', requestId: expect.any(String) });
    // Part of A's stream arrives, then the person opens B before the rest does.
    req.event({
      type: HttpEventType.DownloadProgress,
      loaded: 1,
      partialText: sse({ type: 'user', message: user('ua', 'Hello from A') }),
    });
    expect(store.messages().map((m) => m.id)).toEqual(['ua']);

    store.open('b');
    loaded('b');
    expect(req.cancelled).toBe(true);
    await sending;
    expect(store.messages()).toEqual([]);
    expect(store.streaming()).toBe(false);
  });

  it('drops a decision that comes back after the chat changed', async () => {
    store.open('a');
    loaded('a');
    const deciding = store.decide('t1', { decision: 'approve', always: false });
    const req = http.expectOne('/api/chats/a/tools/t1/decision');
    store.open('b');
    loaded('b');
    req.flush({ updated: answer('xa'), reply: answer('ya') });
    await deciding;
    expect(store.messages()).toEqual([]);
  });

  describe('an answer that stops short', () => {
    /** Sends, lets the chat load, and returns the stream's request. */
    const sendIn = (chatId: string, text = 'Hello') => {
      store.open(chatId);
      loaded(chatId);
      const sending = store.send(text, 'auto');
      const req = http.expectOne(`/api/chats/${chatId}/messages`);
      return { sending, req };
    };

    it('is a failure when the stream is empty, however normal the response', async () => {
      const { sending, req } = sendIn('empty');
      req.flush('');
      await expect(sending).rejects.toThrow();
      expect(store.status()).not.toBe('Donovan answered.');
      expect(store.streaming()).toBe(false);
    });

    it('drops the partial answer when the stream ends without done, and shows what the server kept', async () => {
      const { sending, req } = sendIn('cut');
      const partial = sse(
        { type: 'user', message: user('u1', 'Hello') },
        { type: 'start', id: 'a1', at, routing: [] },
        { type: 'block', index: 0, block: { type: 'text', text: 'Half an' } },
      );
      req.event({ type: HttpEventType.DownloadProgress, loaded: 1, partialText: partial });
      expect(store.messages().map((m) => m.id)).toEqual(['u1', 'a1']);
      req.flush(partial);
      await expect(sending).rejects.toThrow();
      expect(store.messages()).toEqual([]);
      // The chat reloads, and its saved turns show.
      TestBed.tick();
      http.expectOne('/api/chats/cut').flush({
        id: 'cut',
        title: 'cut',
        messages: [user('u1', 'Hello'), answer('a1')],
        intent: null,
        checkpoints: [],
      });
      await TestBed.inject(ApplicationRef).whenStable();
      expect(store.messages()).toEqual([user('u1', 'Hello'), answer('a1')]);
    });

    it('succeeds only with done', async () => {
      const { sending, req } = sendIn('whole');
      req.flush(sse({ type: 'user', message: user('u1', 'Hello') }, { type: 'done', message: answer('a1') }));
      await sending;
      expect(store.status()).toBe('Donovan answered.');
    });
  });

  describe('sending again after a send that failed', () => {
    const failOnce = async (chatId: string, text: string) => {
      const sending = store.send(text, 'auto');
      const req = http.expectOne(`/api/chats/${chatId}/messages`);
      req.error(new ProgressEvent('error'));
      await expect(sending).rejects.toThrow();
      return req.request.body.requestId as string;
    };
    const succeed = async (chatId: string, text: string) => {
      const sending = store.send(text, 'auto');
      const req = http.expectOne(`/api/chats/${chatId}/messages`);
      req.flush(sse({ type: 'done', message: answer(`a-${crypto.randomUUID()}`) }));
      await sending;
      return req.request.body.requestId as string;
    };
    /** The chat's reload after a failure, with or without the turn the server saved. */
    const reloadWith = async (chatId: string, ...messages: UserMessage[]) => {
      TestBed.tick();
      http
        .match(`/api/chats/${chatId}`)
        .forEach((r) => r.flush({ id: chatId, title: chatId, messages, intent: null, checkpoints: [] }));
      await TestBed.inject(ApplicationRef).whenStable();
    };

    it('reuses the id, so a send the server did save is not saved twice', async () => {
      store.open('retry');
      loaded('retry');
      const first = await failOnce('retry', 'Ship it');
      await reloadWith('retry');
      const second = await succeed('retry', 'Ship it');
      expect(second).toBe(first);
      // Finished: the same words sent later are a new message.
      expect(await succeed('retry', 'Ship it')).not.toBe(first);
    });

    it('keeps the id across leaving the chat and coming back', async () => {
      store.open('away');
      loaded('away');
      const first = await failOnce('away', 'Ship it');
      await reloadWith('away');
      store.open('elsewhere');
      loaded('elsewhere');
      store.open('away');
      loaded('away');
      expect(await succeed('away', 'Ship it')).toBe(first);
    });

    it('is a new message once the chat shows the first was saved', async () => {
      store.open('saved');
      loaded('saved');
      const first = await failOnce('saved', 'Ship it');
      await reloadWith('saved', { ...user('u1', 'Ship it'), requestId: first });
      expect(await succeed('saved', 'Ship it')).not.toBe(first);
    });

    /** A send that fails, and the retry its Send again carries. */
    const failed = async (chatId: string, text: string) => {
      const sending = store.send(text, 'auto', ['art-1']);
      http.expectOne(`/api/chats/${chatId}/messages`).error(new ProgressEvent('error'));
      const err = await sending.then(
        () => null,
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(SendFailed);
      return (err as SendFailed).retry;
    };

    it('Send again resends the same operation, even when the reload shows the server saved it', async () => {
      store.open('kept');
      loaded('kept');
      const retry = await failed('kept', 'Ship it');
      await reloadWith('kept', { ...user('u1', 'Ship it'), requestId: retry.requestId });
      const again = store.retry(retry);
      const req = http.expectOne('/api/chats/kept/messages');
      expect(req.request.body).toEqual({
        text: 'Ship it',
        model: 'auto',
        attachments: ['art-1'],
        requestId: retry.requestId,
      });
      req.flush(sse({ type: 'done', message: answer('a-kept') }));
      await again;
    });

    it("Send again from a chat you've left posts nothing, to that chat or the open one", async () => {
      store.open('from');
      loaded('from');
      const retry = await failed('from', 'Ship it');
      await reloadWith('from');
      store.open('to');
      loaded('to');
      await store.retry(retry);
      http.expectNone('/api/chats/to/messages');
      http.expectNone('/api/chats/from/messages');
    });

    it('is a new message when the text is different', async () => {
      store.open('other');
      loaded('other');
      const first = await failOnce('other', 'Ship it');
      await reloadWith('other');
      expect(await succeed('other', 'Hold it')).not.toBe(first);
    });
  });
});
