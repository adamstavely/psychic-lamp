import type { Insights, Kpi, Share } from '@donovan/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DB, type Db } from '../db/db.module.js';

/** How far back Insights looks. */
export const INSIGHTS_DAYS = 30;

/**
 * Insights, counted from what's stored rather than the prototype's fixed numbers: the workspace's questions and answers,
 * the models answers were routed to, the tools they called and on which servers, write tools waiting for approval, and
 * registry installs and reviews, over the last 30 days.
 */
@Injectable()
export class InsightsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async insights(now = new Date()): Promise<Insights> {
    const from = new Date(now.getTime() - INSIGHTS_DAYS * 24 * 3600_000);
    const since = from.toISOString();
    const one = async <T>(query: ReturnType<typeof sql>): Promise<T> => (await this.db.execute(query)).rows[0] as T;
    const many = async <T>(query: ReturnType<typeof sql>): Promise<T[]> => (await this.db.execute(query)).rows as T[];

    const turns = await one<{ questions: number; answers: number; chats: number; people: number }>(sql`
      select count(*) filter (where role = 'user')::int as questions,
             count(*) filter (where role = 'assistant')::int as answers,
             count(distinct (owner_id, chat_id))::int as chats,
             count(distinct owner_id)::int as people
      from messages where created_at >= ${since}`);
    const tools = await one<{ calls: number; waiting: number }>(sql`
      select count(*) filter (where b->>'status' in ('done', 'running'))::int as calls,
             count(*) filter (where b->>'status' = 'pending')::int as waiting
      from messages m, jsonb_array_elements(m.body->'blocks') b
      where m.role = 'assistant' and m.created_at >= ${since} and b->>'type' = 'tool'`);
    const byModel = await many<{ name: string; count: number }>(sql`
      select r->>'name' as name, count(*)::int as count
      from messages m, jsonb_array_elements(m.body->'routing') r
      where m.role = 'assistant' and m.created_at >= ${since} and r->>'kind' = 'model'
      group by 1 order by 2 desc, 1`);
    const byServer = await many<{ name: string; count: number }>(sql`
      select split_part(b->>'server', ' · ', 1) as name, count(*)::int as count
      from messages m, jsonb_array_elements(m.body->'blocks') b
      where m.role = 'assistant' and m.created_at >= ${since} and b->>'type' = 'tool'
      group by 1 order by 2 desc, 1`);
    const registry = await one<{ installs: number; decisions: number; published: number; waiting: number }>(sql`
      select (select count(*) from registry_installs where created_at >= ${since})::int as installs,
             (select count(*) from registry_reviews where at >= ${since})::int as decisions,
             (select count(*) from registry_items where status = 'published')::int as published,
             (select count(*) from registry_items where status = 'pending')::int as waiting`);
    const installs = await many<{
      kind: Insights['installs'][number]['kind'];
      id: string;
      name: string;
      count: number;
    }>(sql`
      select i.kind, i.item_id as id, r.name, count(*)::int as count
      from registry_installs i join registry_items r on r.kind = i.kind and r.id = i.item_id
      where i.created_at >= ${since}
      group by 1, 2, 3 order by 4 desc, 3 limit 5`);

    const kpis: Kpi[] = [
      { label: 'Questions', value: turns.questions, detail: `in ${turns.chats} chats, by ${turns.people} people` },
      { label: 'Answers', value: turns.answers, detail: 'including regenerated ones' },
      { label: 'Tool calls', value: tools.calls, detail: `${tools.waiting} waiting for approval` },
      { label: 'Installs', value: registry.installs, detail: 'of registry servers and skills' },
      {
        label: 'Review decisions',
        value: registry.decisions,
        detail: `${registry.waiting} ${registry.waiting === 1 ? 'submission' : 'submissions'} waiting`,
      },
      { label: 'In the registry', value: registry.published, detail: 'published items' },
    ];
    return { from: since, to: now.toISOString(), kpis, byModel: shares(byModel), byServer: shares(byServer), installs };
  }
}

function shares(rows: { name: string; count: number }[]): Share[] {
  const total = rows.reduce((n, r) => n + r.count, 0);
  return rows.map((r) => ({ name: r.name, count: r.count, share: total ? r.count / total : 0 }));
}
