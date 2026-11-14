import { Client } from '@elastic/elasticsearch';
import type { RegistryKind } from '@donovan/contracts';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';

export const REGISTRY_INDEX = 'donovan-registry';

const PROPERTIES = {
  kind: { type: 'keyword' },
  id: { type: 'keyword' },
  name: { type: 'text', fields: { raw: { type: 'keyword' }, words: { type: 'text', analyzer: 'simple' } } },
  slug: { type: 'text', analyzer: 'simple' },
  summary: { type: 'text' },
  text: { type: 'text' },
  version: { type: 'long' },
} as const;

export interface RegistryDoc {
  kind: RegistryKind;
  id: string;
  name: string;
  slug: string;
  summary: string;
  /** The words in the item's details (tool names, schema fields, members, tags), so they find it too. */
  text: string;
  /** The row's searchVersion this was built from; reconciliation re-indexes anything older. */
  version: number;
}

/** The document id for an item. */
export const registryDocId = (kind: string, id: string): string => `${kind}:${id}`;

/**
 * Full-text search over the registry. Postgres stays the record and decides who may see what: this index only answers
 * "which items match", and the service filters those by visibility and scope.
 */
@Injectable()
export class RegistrySearch implements OnModuleInit {
  readonly #log = new Logger(RegistrySearch.name);

  constructor(private readonly es: Client) {}

  async onModuleInit(): Promise<void> {
    try {
      if (!(await this.es.indices.exists({ index: REGISTRY_INDEX })))
        await this.es.indices.create({ index: REGISTRY_INDEX, mappings: { properties: PROPERTIES } });
    } catch (err) {
      // Search falls back to Postgres (see RegistryService); the API still starts.
      this.#log.warn(`Couldn't prepare the ${REGISTRY_INDEX} index (${err instanceof Error ? err.name : 'error'})`);
    }
  }

  /** Indexes items; throws if the request fails, and returns how many items Elasticsearch refused. */
  async index(docs: RegistryDoc[]): Promise<number> {
    if (docs.length === 0) return 0;
    const res = await this.es.bulk({
      refresh: true,
      operations: docs.flatMap((d) => [{ index: { _index: REGISTRY_INDEX, _id: registryDocId(d.kind, d.id) } }, d]),
    });
    const failed = res.errors ? res.items.filter((i) => i.index?.error).length : 0;
    if (failed) this.#log.warn(`${failed} of ${docs.length} registry items weren't indexed; reconciliation will retry`);
    return failed;
  }

  /** Document ids (kind:id) of the items that match, best first. */
  async search(q: string, kind?: RegistryKind): Promise<string[]> {
    const res = await this.es.search<RegistryDoc>({
      index: REGISTRY_INDEX,
      size: 100,
      _source: ['kind', 'id'],
      query: {
        bool: {
          filter: kind ? [{ term: { kind } }] : [],
          must: [
            {
              multi_match: {
                query: q,
                fields: ['name^3', 'name.words^3', 'slug^2', 'summary', 'text'],
                fuzziness: 'AUTO',
                prefix_length: 1,
              },
            },
          ],
        },
      },
    });
    return res.hits.hits.map((h) => registryDocId(h._source!.kind, h._source!.id));
  }
}
