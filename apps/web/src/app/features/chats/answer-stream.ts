import { HttpClient, HttpEventType } from '@angular/common/http';
import type { SendMessage, StreamEvent } from '@donovan/contracts';
import { EMPTY, Observable, concatWith, defer, filter, map, mergeMap, tap, throwError } from 'rxjs';

/**
 * Sends a message and emits the answer's events as they arrive. HttpClient (on its fetch backend) reports the body as
 * it streams, so the auth interceptor still adds the token; each report carries all text so far, and this parses only
 * the events it hasn't seen.
 */
export function streamMessage(http: HttpClient, chatId: string, body: SendMessage): Observable<StreamEvent> {
  return streamPost(http, `/api/chats/${encodeURIComponent(chatId)}/messages`, body);
}

/** A stream that ended without its `done` event: cut off on the way, or the server failed after it began. */
export class IncompleteAnswer extends Error {
  constructor() {
    super('The answer stopped before it finished');
    this.name = 'IncompleteAnswer';
  }
}

/**
 * Any POST that answers with the stream: a reply, or a regenerated answer. It errors with IncompleteAnswer if the
 * stream ends without `done`, however normal the ending looked (a 200 that stops early is still a failure). Cancelling
 * it, by unsubscribing, isn't an ending: nothing is emitted.
 */
export function streamPost(http: HttpClient, url: string, body: unknown): Observable<StreamEvent> {
  return defer(() => {
    const reader = new SseReader();
    let done = false;
    return http
      .post(url, body, {
        observe: 'events',
        responseType: 'text',
        reportProgress: true,
      })
      .pipe(
        map((e) =>
          e.type === HttpEventType.DownloadProgress
            ? (e.partialText ?? '')
            : e.type === HttpEventType.Response
              ? (e.body ?? '')
              : null,
        ),
        filter((text): text is string => text !== null),
        mergeMap((text) => reader.read(text)),
        tap((e) => {
          if (e.type === 'done') done = true;
        }),
        concatWith(defer(() => (done ? EMPTY : throwError(() => new IncompleteAnswer())))),
      );
  });
}

/** Turns a growing server-sent-events body into the events not yet returned. */
export class SseReader {
  #seen = 0;

  read(all: string): StreamEvent[] {
    const end = all.lastIndexOf('\n\n');
    if (end < this.#seen) return [];
    const fresh = all.slice(this.#seen, end);
    this.#seen = end + 2;
    return fresh
      .split('\n\n')
      .map((chunk) => chunk.split('\n').find((line) => line.startsWith('data: ')))
      .filter((line): line is string => !!line)
      .map((line) => JSON.parse(line.slice(6)) as StreamEvent);
  }
}
