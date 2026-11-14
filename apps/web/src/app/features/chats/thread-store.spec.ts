import { HttpEventType, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { AssistantMessage, UserMessage } from '@donovan/contracts';
import { ChatsStore } from '../../core/chats-store';
import { ThreadStore } from './thread-store';

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
});
