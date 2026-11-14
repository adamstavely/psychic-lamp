import { Client } from '@elastic/elasticsearch';
import type { Message } from '@donovan/contracts';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';

export const CHAT_INDEX = 'donovan-chats';

export interface ChatDoc {
  ownerId: string;
  id: string;
  title: string;
  text: string;
  /** The chat's searchVersion this document was built from; reconciliation re-indexes anything older. */
  version: number;
}

const PROPERTIES = {
  ownerId: { type: 'keyword' },
  id: { type: 'keyword' },
  title: { type: 'text' },
  text: { type: 'text' },
  version: { type: 'long' },
} as const;

/** Full-text search over a person's chats: titles and what was said in them. Postgres stays the record. */
@Injectable()
export class ChatSearch implements OnModuleInit {
  readonly #log = new Logger(ChatSearch.name);

  constructor(private readonly es: Client) {}

  async onModuleInit(): Promise<void> {
    try {
      if (!(await this.es.indices.exists({ index: CHAT_INDEX })))
        await this.es.indices.create({ index: CHAT_INDEX, mappings: { properties: PROPERTIES } });
      // An index from before versions were tracked gains the field; its documents read as version 0 until refreshed.
      else await this.es.indices.putMapping({ index: CHAT_INDEX, properties: { version: PROPERTIES.version } });
    } catch (err) {
      this.#log.warn(`Couldn't prepare the ${CHAT_INDEX} index (${err instanceof Error ? err.name : 'error'})`);
    }
  }

  /**
   * Indexes chats, logging rather than failing: a chat that isn't searchable yet is still a chat, and reconciliation
   * picks up what didn't make it. Returns how many didn't (a whole failed request counts them all).
   */
  async index(docs: ChatDoc[]): Promise<number> {
    if (docs.length === 0) return 0;
    try {
      const res = await this.es.bulk({
        refresh: true,
        operations: docs.flatMap((d) => [{ index: { _index: CHAT_INDEX, _id: `${d.ownerId}:${d.id}` } }, d]),
      });
      const failed = res.errors ? res.items.filter((i) => i.index?.error).length : 0;
      if (failed)
        this.#log.warn(`${failed} of ${docs.length} chats weren't indexed for search; reconciliation will retry`);
      return failed;
    } catch (err) {
      this.#log.warn(
        `Couldn't index chats for search (${err instanceof Error ? err.name : 'error'}); reconciliation will retry`,
      );
      return docs.length;
    }
  }

  async remove(ownerId: string, id: string): Promise<void> {
    try {
      await this.es.delete({ index: CHAT_INDEX, id: `${ownerId}:${id}`, refresh: true });
    } catch {
      // Already gone, or search is down: either way it won't be found.
    }
  }

  async removeOwner(ownerId: string): Promise<void> {
    await this.es.deleteByQuery({
      index: CHAT_INDEX,
      query: { term: { ownerId } },
      refresh: true,
      ignore_unavailable: true,
    });
  }

  /** The person's chats that match, best first, each with the passage that matched. */
  async search(ownerId: string, q: string, size = 8): Promise<{ id: string; snippet: string | null }[]> {
    const res = await this.es.search<ChatDoc>({
      index: CHAT_INDEX,
      size,
      _source: ['id'],
      query: {
        bool: {
          filter: [{ term: { ownerId } }],
          must: [
            {
              multi_match: {
                query: q,
                fields: ['title^3', 'text'],
                operator: 'and',
                fuzziness: 'AUTO',
                prefix_length: 1,
              },
            },
          ],
        },
      },
      highlight: { fields: { text: { fragment_size: 120, number_of_fragments: 1 } }, pre_tags: [''], post_tags: [''] },
    });
    return res.hits.hits.map((h) => ({ id: h._source!.id, snippet: h.highlight?.['text']?.[0] ?? null }));
  }
}

/** What a chat says, as plain text, for search. */
export function chatText(messages: Message[]): string {
  return messages
    .flatMap((m) =>
      m.role === 'user'
        ? [m.text]
        : m.blocks.flatMap((b) => {
            switch (b.type) {
              case 'text':
                return [b.text];
              case 'list':
                return b.items;
              case 'skill':
                return [b.note];
              case 'claims':
                return b.items.map((c) => c.text);
              case 'table':
                return [b.rows.map((r) => r.join(' ')).join('\n')];
              case 'artifact':
                return [b.name];
              case 'tool':
                return [`${b.name} ${b.summary}`];
              default:
                return [];
            }
          }),
    )
    .join('\n');
}
