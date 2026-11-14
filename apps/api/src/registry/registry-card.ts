import type { RegistryCard, RegistryItem, RegistryStatus } from '@donovan/contracts';

/** The fields a card is made from, kept per kind so `details` stays tied to `kind`. */
export type CardInput = RegistryItem extends infer I
  ? I extends RegistryItem
    ? Pick<I, 'kind' | 'details' | 'slug' | 'version' | 'status'>
    : never
  : never;

const REVIEW: Partial<Record<RegistryStatus, string>> = {
  draft: 'Draft',
  pending: 'Waiting for review',
  'changes-requested': 'Changes requested',
  rejected: 'Rejected',
};

/**
 * What an item's catalog card shows, from its details: the prototype's per-area cards (a server's tools and installs,
 * an agent's autonomy and runs, a dataset's format and size…). An item not yet published says where it is in review
 * instead of its usual state.
 */
export function cardFor(item: CardInput): RegistryCard {
  const meta = `${item.slug} · ${item.version}`;
  const card = ((): RegistryCard => {
    switch (item.kind) {
      case 'skill':
        return {
          badge: 'Published',
          badgeTone: 'ok',
          meta,
          stats: [...(item.details.score !== null ? [`Score ${item.details.score}`] : []), `${item.details.uses} uses`],
          facet: null,
        };
      case 'server':
        return {
          badge: item.details.verified ? 'Verified' : 'Unverified',
          badgeTone: item.details.verified ? 'ok' : 'warn',
          meta,
          stats: [`${item.details.tools.length} tools`, `${item.details.installs} installs`],
          facet: null,
        };
      case 'agent':
        return {
          badge: item.details.autonomy,
          badgeTone: 'info',
          meta,
          stats: [`${item.details.runs} runs`, `${item.details.success} success`],
          facet: null,
        };
      case 'workflow':
        return {
          badge: item.details.state,
          badgeTone: item.details.state === 'Active' ? 'ok' : 'neutral',
          meta: item.details.schedule ? `${item.details.nodes.length || '–'} steps · ${item.details.schedule}` : meta,
          stats: [],
          facet: null,
        };
      case 'model':
        return {
          badge: item.details.task,
          badgeTone: 'info',
          meta,
          stats: item.details.metrics.slice(0, 2).map((m) => `${m.value} ${m.label}`),
          facet: item.details.task,
        };
      case 'dataset':
        return {
          badge: item.details.format,
          badgeTone: 'neutral',
          meta,
          stats: [`${item.details.rows} rows`, item.details.size, `updated ${item.details.updated}`],
          facet: null,
        };
      case 'space':
        return {
          badge: `${item.details.visits} visits`,
          badgeTone: 'neutral',
          meta: `${item.slug} · ${item.details.model}`,
          stats: [],
          facet: null,
        };
      case 'collection':
        return {
          badge: `${item.details.members.length} ${item.details.members.length === 1 ? 'entry' : 'entries'}`,
          badgeTone: 'neutral',
          meta: 'Collection',
          stats: [],
          facet: null,
        };
      case 'prompt':
        return {
          badge: `v${item.details.published} published`,
          badgeTone: 'ok',
          meta: `${item.slug} · ${item.details.model}`,
          stats: [`${item.details.versions.length} versions`, `${item.details.uses} uses`],
          facet: null,
        };
    }
  })();
  const review = REVIEW[item.status];
  return review ? { ...card, badge: review, badgeTone: item.status === 'pending' ? 'warn' : 'neutral' } : card;
}
