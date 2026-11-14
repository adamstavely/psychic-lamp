import type { Brief } from '@donovan/contracts';

/**
 * The canned Daily Brief, from the prototype (all fictional). Times are relative to now, so the brief always reads as
 * this morning's; anything the reader sees as a clock time is formatted in their time zone.
 */
export type BriefContent = Omit<Brief, 'seenUpdates' | 'needs' | 'memos'> & {
  needs: Omit<Brief['needs'][number], 'done'>[];
  memos: Omit<Brief['memos'][number], 'read'>[];
};

const MINUTE = 60_000;

export function briefFixture(now: Date, timeZone: string): BriefContent {
  const ago = (minutes: number) => new Date(now.getTime() - minutes * MINUTE).toISOString();
  // Meetings and the sign-off sit at the reader's own clock times, today and yesterday, as in the prototype.
  const at = (dayOffset: number, hour: number, minute: number) => wallClock(now, timeZone, dayOffset, hour, minute);
  const standup = at(0, 9, 30);
  const goNoGo = at(0, 14, 0);
  const board = at(0, 16, 0);
  const clock = (d: Date) =>
    new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(d);
  const plus = (d: Date, minutes: number) => new Date(d.getTime() + minutes * MINUTE).toISOString();

  return {
    since: at(-1, 18, 12).toISOString(),
    read: [
      `Two things are time-sensitive. The Fraud Sentinel go/no-go moved up to ${clock(goNoGo)}, and the #risk-ops rollout note is still waiting on your approval.`,
      `Overnight, drift on device_age crossed the alert threshold and 12 new chargeback disputes matched your saved search. Both are worth a look before the ${clock(goNoGo)} meeting.`,
    ],
    needs: [
      {
        id: 'rollout-note',
        kind: 'approval',
        title: 'Post rollout note to #risk-ops',
        meta: 'Fraud rollout · Slack write · waiting 13h',
        dueAt: goNoGo.toISOString(),
        action: { label: 'Review', href: '/chats/fraud' },
      },
      {
        id: 'sku-run',
        kind: 'workflow',
        title: 'SKU onboarding paused at Legal sign-off',
        meta: 'Run #418 · 3 of 6 steps done',
        dueAt: null,
        action: { label: 'Open run', href: null },
      },
      {
        id: 'invoice-eval',
        kind: 'model',
        title: 'Invoice extractor v2.1 eval finished at 94.2% F1',
        meta: 'Owner sign-off needed before promote',
        dueAt: null,
        action: { label: 'Sign off', href: null },
      },
      {
        id: 'txn-graph-access',
        kind: 'access',
        title: 'Priya Shah requested access to txn-graph',
        meta: 'Confidential · read-only · 30 days',
        dueAt: null,
        action: { label: 'Decide', href: null },
      },
    ],
    memos: [
      {
        id: 'go-no-go-moved',
        from: 'Mara Lindqvist',
        role: 'VP Risk',
        at: ago(55),
        subject: `Fraud Sentinel go/no-go moved to ${clock(goNoGo)}`,
        preview:
          'Legal needs the afternoon slot. Please bring the drift numbers and the final rollout note so we can decide in one pass.',
        project: 'Fraud rollout',
      },
      {
        id: 'approval-tiers',
        from: 'Platform Security',
        role: 'Policy',
        at: ago(102),
        subject: 'New tool-approval tiers take effect Monday',
        preview:
          'Write actions against Confidential data will require a second approver. Existing workflows are grandfathered for 14 days.',
        project: null,
      },
      {
        id: 'intents-draft-2',
        from: 'Devon Price',
        role: 'Support Ops',
        at: ago(10 * 60 + 17),
        subject: 'September intents readout, draft 2',
        preview:
          'Folded in your comments on billing disputes. One open question on how we bucket refund-adjacent tickets.',
        project: 'Support triage',
      },
      {
        id: 'routing-default',
        from: 'Donovan Ops',
        role: 'Platform',
        at: ago(12 * 60 + 27),
        subject: 'Routing default moves to claude-sonnet-4.5 next month',
        preview: 'Chats without a pinned model will switch automatically. Pin a model in project settings to opt out.',
        project: null,
      },
    ],
    searches: [
      {
        id: 'chargebacks',
        query: 'chargeback AND mcc:7995',
        scope: 'Support DW',
        newCount: 12,
        top: 'Dispute spike from 3 gaming merchants, mostly EU cards',
        at: ago(129),
      },
      {
        id: 'sentinel-drift',
        query: 'Fraud Sentinel drift',
        scope: 'Model monitoring',
        newCount: 3,
        top: 'PSI on device_age crossed 0.2 overnight',
        at: ago(5 * 60 + 43),
      },
      {
        id: 'rtp-fraud',
        query: 'real-time payments fraud',
        scope: 'News & research',
        newCount: 7,
        top: 'Regulator guidance on push-payment reimbursement',
        at: ago(8 * 60 + 37),
      },
    ],
    meetings: [
      {
        id: 'standup',
        title: 'Risk ops standup',
        start: standup.toISOString(),
        end: plus(standup, 15),
        where: 'Teams',
        important: false,
      },
      {
        id: 'go-no-go',
        title: 'Fraud Sentinel go/no-go',
        start: goNoGo.toISOString(),
        end: plus(goNoGo, 45),
        where: 'Room 4B · Teams',
        important: true,
      },
      {
        id: 'review-board',
        title: 'Model review board',
        start: board.toISOString(),
        end: plus(board, 30),
        where: 'Teams',
        important: false,
      },
    ],
    accounts: [
      {
        id: 'mara',
        name: 'Mara Lindqvist',
        sub: 'VP Risk',
        kind: 'person',
        link: { label: 'Open the chat', href: '/chats/fraud' },
        updates: [
          { id: 'mara-1', at: ago(55), text: `Moved the Fraud Sentinel go/no-go to ${clock(goNoGo)}` },
          { id: 'mara-2', at: ago(69), text: 'Commented on the rollout note draft' },
        ],
      },
      {
        id: 'fraud-rollout',
        name: 'Fraud rollout',
        sub: 'Project',
        kind: 'project',
        link: { label: 'Open the project', href: '/projects/fraud-rollout' },
        updates: [
          { id: 'fraud-1', at: ago(59), text: 'Rollout note waiting on your approval' },
          { id: 'fraud-2', at: ago(167), text: 'Scored batch refreshed, 48,210 rows' },
          { id: 'fraud-3', at: ago(5 * 60 + 43), text: 'Drift alert attached from Fraud Sentinel' },
        ],
      },
      {
        id: 'fraud-sentinel',
        name: 'Fraud Sentinel',
        sub: 'Model v3.2',
        kind: 'model',
        link: { label: 'Open in Build', href: null },
        updates: [
          { id: 'sentinel-1', at: ago(5 * 60 + 47), text: 'PSI on device_age crossed 0.2' },
          { id: 'sentinel-2', at: ago(6 * 60 + 27), text: 'Nightly eval: precision 0.91, recall 0.87' },
        ],
      },
      {
        id: 'sku-onboarding',
        name: 'SKU onboarding',
        sub: 'Workflow',
        kind: 'workflow',
        link: { label: 'Open in Build', href: null },
        updates: [{ id: 'sku-1', at: ago(11 * 60 + 17), text: 'Run #418 paused at Legal sign-off' }],
      },
      {
        id: 'devon',
        name: 'Devon Price',
        sub: 'Support Ops',
        kind: 'person',
        link: { label: 'Open the chat', href: '/chats/intents' },
        updates: [{ id: 'devon-1', at: ago(10 * 60 + 17), text: 'Shared September intents readout, draft 2' }],
      },
      {
        id: 'txn-graph',
        name: 'txn-graph',
        sub: 'Dataset',
        kind: 'dataset',
        link: { label: 'Open in Build', href: null },
        updates: [
          { id: 'txn-1', at: ago(11 * 60 + 52), text: 'Access request from Priya Shah' },
          { id: 'txn-2', at: ago(12 * 60 + 42), text: 'Schema v14 published, 2 new columns' },
        ],
      },
      {
        id: 'invoice-extractor',
        name: 'Invoice extractor',
        sub: 'Model v2.1',
        kind: 'model',
        link: { label: 'Open in Build', href: null },
        updates: [{ id: 'invoice-1', at: ago(8 * 60 + 5), text: 'Eval finished at 94.2% F1, ready for sign-off' }],
      },
      {
        id: 'platform-security',
        name: 'Platform Security',
        sub: 'Team',
        kind: 'team',
        link: { label: 'Open in Build', href: null },
        updates: [{ id: 'security-1', at: ago(102), text: 'New tool-approval tiers take effect Monday' }],
      },
    ],
    resume: [
      { id: 'fraud', title: 'Q4 fraud model rollout', meta: 'Fraud rollout · 1 write waiting', href: '/chats/fraud' },
      {
        id: 'intents',
        title: 'Summarize support intents, Sept',
        meta: 'Support triage · 3 artifacts',
        href: '/chats/intents',
      },
      { id: 'rfc', title: 'Draft RFC: tool approval tiers', meta: 'Yesterday · draft v2', href: '/chats/rfc' },
    ],
  };
}

/** The instant that reads hour:minute in `timeZone`, on the reader's today plus `dayOffset` days. */
export function wallClock(now: Date, timeZone: string, dayOffset: number, hour: number, minute: number): Date {
  const today = partsIn(now, timeZone);
  const guess = Date.UTC(today.year, today.month - 1, today.day + dayOffset, hour, minute);
  // Correct by the zone's offset at that moment; a second pass settles a daylight-saving change in between.
  let t = guess - offsetAt(guess, timeZone);
  t = guess - offsetAt(t, timeZone);
  return new Date(t);
}

function partsIn(d: Date | number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(d);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

/** How far `timeZone` is ahead of UTC at `utcMs`, in ms. */
function offsetAt(utcMs: number, timeZone: string): number {
  const p = partsIn(utcMs, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(utcMs / 1000) * 1000;
}
