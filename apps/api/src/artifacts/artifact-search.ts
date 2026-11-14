import { Client } from '@elastic/elasticsearch';
import type { ArtifactKind } from '@donovan/contracts';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';

export const ARTIFACT_INDEX = 'donovan-artifacts';

/**
 * name.words splits on punctuation too (the standard tokenizer keeps "cohort.json" as one word, so "cohort" wouldn't
 * find it).
 */
const PROPERTIES = {
  ownerId: { type: 'keyword' },
  id: { type: 'keyword' },
  kind: { type: 'keyword' },
  name: { type: 'text', fields: { raw: { type: 'keyword' }, words: { type: 'text', analyzer: 'simple' } } },
  text: { type: 'text' },
  version: { type: 'long' },
} as const;

export interface ArtifactDoc {
  ownerId: string;
  id: string;
  name: string;
  kind: ArtifactKind;
  text: string;
  /** The artifact's updatedAt (ms) this document was built from; reconciliation re-indexes anything older. */
  version: number;
}

/** Full-text search over a person's artifacts. Postgres stays the record; this index only answers "which ones match". */
@Injectable()
export class ArtifactSearch implements OnModuleInit {
  readonly #log = new Logger(ArtifactSearch.name);

  constructor(private readonly es: Client) {}

  async onModuleInit(): Promise<void> {
    try {
      const exists = await this.es.indices.exists({ index: ARTIFACT_INDEX });
      if (!exists) await this.es.indices.create({ index: ARTIFACT_INDEX, mappings: { properties: PROPERTIES } });
      else {
        // Indexes made before name.words existed get it now, and their documents are re-read so it's filled in.
        const current = await this.es.indices.getMapping({ index: ARTIFACT_INDEX });
        const name = current[ARTIFACT_INDEX]?.mappings.properties?.['name'] as
          { fields?: Record<string, unknown> } | undefined;
        if (!name?.fields?.['words']) {
          await this.es.indices.putMapping({ index: ARTIFACT_INDEX, properties: { name: PROPERTIES.name } });
          await this.es.updateByQuery({ index: ARTIFACT_INDEX, conflicts: 'proceed', refresh: true });
        }
        await this.es.indices.putMapping({ index: ARTIFACT_INDEX, properties: { version: PROPERTIES.version } });
      }
    } catch (err) {
      // Search degrades to Postgres matching (see ArtifactsService); the API still starts.
      this.#log.warn(`Couldn't prepare the ${ARTIFACT_INDEX} index: ${String(err)}`);
    }
  }

  /** Indexes artifacts; throws if the request fails, and returns how many items Elasticsearch refused. */
  async index(docs: ArtifactDoc[]): Promise<number> {
    if (docs.length === 0) return 0;
    const res = await this.es.bulk({
      refresh: true,
      operations: docs.flatMap((d) => [{ index: { _index: ARTIFACT_INDEX, _id: `${d.ownerId}:${d.id}` } }, d]),
    });
    const failed = res.errors ? res.items.filter((i) => i.index?.error).length : 0;
    if (failed)
      this.#log.warn(`${failed} of ${docs.length} artifacts weren't indexed for search; reconciliation will retry`);
    return failed;
  }

  async removeOwner(ownerId: string): Promise<void> {
    await this.es.deleteByQuery({
      index: ARTIFACT_INDEX,
      query: { term: { ownerId } },
      refresh: true,
      ignore_unavailable: true,
    });
  }

  /** Ids of the person's artifacts that match, best first. */
  async search(ownerId: string, q: string, kind?: ArtifactKind): Promise<string[]> {
    const res = await this.es.search<ArtifactDoc>({
      index: ARTIFACT_INDEX,
      size: 50,
      _source: ['id'],
      query: {
        bool: {
          filter: [{ term: { ownerId } }, ...(kind ? [{ term: { kind } }] : [])],
          must: [
            {
              multi_match: {
                query: q,
                fields: ['name^3', 'name.words^3', 'text'],
                fuzziness: 'AUTO',
                prefix_length: 1,
              },
            },
          ],
        },
      },
    });
    return res.hits.hits.map((h) => h._source!.id);
  }
}
