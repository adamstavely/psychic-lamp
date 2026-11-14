import { HttpClient, HttpEventType } from '@angular/common/http';
import type { SendMessage, StreamEvent } from '@donovan/contracts';
import { Observable, filter, map, mergeMap } from 'rxjs';

/**
 * Sends a message and emits the answer's events as they arrive. HttpClient (on its fetch backend) reports the body as
 * it streams, so the auth interceptor still adds the token; each report carries all text so far, and this parses only
 * the events it hasn't seen.
 */
export function streamMessage(http: HttpClient, chatId: string, body: SendMessage): Observable<StreamEvent> {
  return streamPost(http, `/api/chats/${encodeURIComponent(chatId)}/messages`, body);
}

/** Any POST that answers with the stream: a reply, or a regenerated answer. */
export function streamPost(http: HttpClient, url: string, body: unknown): Observable<StreamEvent> {
  const reader = new SseReader();
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
    );
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
