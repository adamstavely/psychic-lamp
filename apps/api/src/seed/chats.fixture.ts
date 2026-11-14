import type { Block, BlockOf, Claim, Route, SessionIntent, Sensitivity } from '@donovan/contracts';
import { artifactId } from './artifact-ids.js';

// The prototype's chats, all fictional, converted to the contract's shapes. Seeded once per person (see SeedService).

export interface SeedChat {
  id: string;
  title: string;
  project: string | null;
  sensitivity: Sensitivity;
  pinned: boolean;
  calibrated: boolean;
  intent: SessionIntent | null;
  /** How long ago it was last active, in minutes. */
  minutesAgo: number;
  messages: (
    { role: 'user'; text: string } | { role: 'assistant'; routing: Route[]; blocks: Block[]; durationMs: number }
  )[];
}

const DAY = 24 * 60;

const text = (t: string): Block => ({ type: 'text', text: t });
const list = (...items: string[]): Block => ({ type: 'list', items });
const table = (columns: string[], ...rows: string[][]): Block => ({ type: 'table', columns, rows });
const chart = (title: string, ...bars: [string, number, string][]): Block => ({
  type: 'chart',
  title,
  bars: bars.map(([label, value, display]) => ({ label, value, display })),
});
const skill = (name: string, version: string, note: string): Block => ({ type: 'skill', name, version, note });
const artifact = (name: string, kind: 'Doc' | 'Code' | 'Data', meta: string): Block => ({
  type: 'artifact',
  artifactId: artifactId(name),
  name,
  kind,
  meta,
});
const steps = (title: string, ...items: [string, BlockOf<'steps'>['items'][number]['status']][]): Block => ({
  type: 'steps',
  title,
  items: items.map(([label, status]) => ({ label, status })),
});

function tool(
  id: string,
  name: string,
  server: string,
  summary: string,
  sensitivity: Sensitivity,
  more: Partial<Pick<BlockOf<'tool'>, 'status' | 'write' | 'durationMs' | 'args' | 'result'>> = {},
): Block {
  const status = more.status ?? 'done';
  return {
    type: 'tool',
    id,
    name,
    server,
    summary,
    sensitivity,
    status,
    write: more.write ?? false,
    durationMs:
      more.durationMs ?? (status === 'done' ? 1200 + ((id.charCodeAt(0) * 37 + id.length * 211) % 2600) : null),
    args: more.args ?? {},
    result: more.result ?? null,
  };
}

const routes = (...pairs: [Route['kind'], string][]): Route[] => pairs.map(([kind, name]) => ({ kind, name }));

/** Answers take a little longer the more they do, as in the prototype's "Worked for" line. */
const assistant = (routing: Route[], blocks: Block[]) => ({
  role: 'assistant' as const,
  routing,
  blocks,
  durationMs: Math.round((1.4 + blocks.length * 0.9) * 1000),
});
const user = (t: string) => ({ role: 'user' as const, text: t });

function claim(
  c: Omit<Claim, 'review' | 'source' | 'note' | 'cutoff'> & Partial<Pick<Claim, 'source' | 'note' | 'cutoff'>>,
): Claim {
  return { source: null, note: null, cutoff: null, review: null, ...c };
}

export const SEED_CHATS: SeedChat[] = [
  {
    id: 'fraud',
    title: 'Q4 fraud model rollout',
    project: 'Fraud rollout',
    sensitivity: 'Confidential',
    pinned: true,
    calibrated: false,
    intent: null,
    minutesAgo: 30,
    messages: [
      user(
        "We're rolling Fraud Sentinel v3.2 to 10% of traffic on Friday. Pull last week's scored batch, flag anything odd, and draft the rollout note for #risk-ops.",
      ),
      assistant(
        routes(
          ['model', 'claude-sonnet-4.5'],
          ['skill', 'Rollout note v1.4'],
          ['server', 'Filesystem'],
          ['model', 'Fraud Sentinel v3.2'],
          ['server', 'Slack'],
        ),
        [
          text('Reading the scored batch first, then explaining the top scores with the model itself.'),
          tool('t1', 'read_file', 'Filesystem', 'fraud/batch_2026-10-11.parquet · 1.2M rows', 'Internal', {
            args: { path: 'fraud/batch_2026-10-11.parquet' },
            result: '1,204,880 rows · 46 columns · 412 MB',
          }),
          tool('t2', 'explain', 'Fraud Sentinel', 'Top 40 scores by SHAP · 3 clusters found', 'Confidential', {
            args: { top_k: '40', method: 'shap' },
            result: '3 clusters: BIN 4417-82xx (212 txns), device_age < 1d (88), cross-border CNP (51)',
          }),
          text('Three things stand out:'),
          list(
            'A cluster of 212 card-not-present transactions from one merchant ID scored 0.97+. All share a new BIN range added Oct 9.',
            'False-positive rate on the holdout slice is 0.58%, inside the 0.8% guardrail.',
            'p99 latency was 44 ms, 3 ms over the SLO, during the 02:00 UTC batch window only.',
          ),
          skill(
            'Rollout note',
            'v1.4',
            'Drafted a 180-word note with the three findings, the 10% cohort definition and the rollback trigger.',
          ),
          artifact('Rollout note — Fraud Sentinel v3.2', 'Doc', 'v2 · 180 words · 3 sections'),
          artifact('cohort.json', 'Data', '5 keys · EU, card-not-present, 10%'),
          tool('t3', 'post_message', 'Slack · #risk-ops', 'Post the rollout note (write)', 'Confidential', {
            status: 'pending',
            write: true,
            args: {
              channel: '#risk-ops',
              text: 'Rollout note · 180 words',
              attachments: '3 · findings.md, cohort.json, rollback.md',
              unfurl_links: 'false',
            },
          }),
          text(
            'The post needs your approval: #risk-ops is a shared channel and the draft includes confidential threshold values.',
          ),
        ],
      ),
    ],
  },
  {
    id: 'supplier',
    title: 'Supplier risk: rare earth magnets',
    project: 'Supplier risk',
    sensitivity: 'Confidential',
    pinned: false,
    calibrated: true,
    intent: {
      task: 'Decide whether to dual-source NdFeB magnets for the 2027 motor line',
      decision: 'Q1 sourcing committee · $18M commitment',
      consequence: 'Wrong call locks in a single-region dependency for 3 years',
    },
    minutesAgo: 8,
    messages: [
      user(
        'What does current reporting say about disruption risk for rare earth magnet supply, and is single-sourcing from the Inner Mongolia cluster defensible through 2027?',
      ),
      assistant(
        routes(['model', 'claude-sonnet-4.5'], ['server', 'Workspace docs'], ['skill', 'Source reliability v1.8']),
        [
          tool(
            's1',
            'search_docs',
            'Workspace docs',
            '5 documents · supply chain corpus · strongest match USGS 2023',
            'Confidential',
            {
              args: { query: 'rare earth magnet supply disruption', corpus: 'Supply chain' },
              result: '5 documents · USGS 2023, CSIS 2023, CRS 2023, 2 internal sourcing memos',
            },
          ),
          {
            type: 'claims',
            items: [
              claim({
                id: 'c1',
                kind: 'grounded',
                confidence: 'high',
                text: 'China accounts for roughly 85–90% of global rare earth refining output, and the Bayan Obo / Baotou cluster is the largest single processing complex.',
                topic: 'Processing concentration',
                source: {
                  title: 'USGS Minerals Yearbook 2023 — Rare Earths',
                  publisher: 'US Geological Survey · Sep 2023',
                  match: 'Strong match',
                  passage:
                    'China produced an estimated 85–90 percent of refined rare earth products in 2022, with the Baotou region the dominant processing centre.',
                },
              }),
              claim({
                id: 'c2',
                kind: 'grounded',
                confidence: 'high',
                text: 'The 2023 export licensing rules for gallium, germanium and graphite are a visible, trackable policy signal; magnet-grade NdFeB was not included.',
                topic: 'Export controls as signal',
                source: {
                  title: "China's Critical Mineral Export Controls",
                  publisher: 'CSIS · Oct 2023',
                  match: 'Strong match',
                  passage:
                    'The controls announced in 2023 cover gallium, germanium and graphite products; rare earth magnets were notably absent from the initial list.',
                },
              }),
              claim({
                id: 'c3',
                kind: 'inferred',
                confidence: 'medium',
                text: 'Taken together, processing concentration is the more durable risk: it would outlast any specific export control regime and is independent of policy changes.',
                topic: 'Durability of structural risk',
                note: 'Synthesized from c1 and c2. No source states this comparison directly.',
              }),
              claim({
                id: 'c4',
                kind: 'model',
                confidence: 'low',
                text: 'Western magnet capacity (MP Materials, Lynas, Noveon) is projected to reach meaningful scale around 2027–2029.',
                topic: 'Western capacity timeline',
                cutoff: 'Early 2025',
                note: 'No document was retrieved for this claim; it comes from training knowledge. Project timelines shift often. Verify against current status reports before relying on it.',
              }),
            ],
          },
          text(
            'On your question: single-sourcing is defensible on cost through 2027, but not on resilience. The defensible position is a qualified second source by late 2026, even at a 12–18% unit premium.',
          ),
        ],
      ),
      user('Challenge that. What is the strongest case that the concentration risk is overstated?'),
      assistant(routes(['model', 'claude-sonnet-4.5'], ['skill', 'Red team hypothesis v2.0']), [
        {
          type: 'claims',
          items: [
            claim({
              id: 'c5',
              kind: 'grounded',
              confidence: 'medium',
              text: 'During the 2010–2012 export dispute, prices spiked and then collapsed within 24 months as buyers substituted, recycled and drew down inventory.',
              topic: 'Historical adaptation',
              source: {
                title: 'Rare Earth Elements: The Global Supply Chain',
                publisher: 'Congressional Research Service · Dec 2023',
                match: 'Partial match',
                passage:
                  'Following the 2010 restrictions, prices for several rare earth oxides fell by more than 60 percent from their 2011 peak as demand destruction and substitution took hold.',
              },
            }),
            claim({
              id: 'c6',
              kind: 'inferred',
              confidence: 'medium',
              text: 'If adaptation repeats on that timescale, a 2027 disruption would be painful for two to three quarters rather than structural, which weakens the case for paying a premium now.',
              topic: 'Counter-position',
              note: 'Model-generated counter-argument. Assumes substitution options comparable to 2011; magnet-grade NdFeB has fewer substitutes than the oxides affected then.',
            }),
          ],
        },
        text(
          'The strongest version of the case: concentration is real, but disruptions have historically been shorter than the market feared, and the premium for a second source may exceed the expected loss.',
        ),
      ]),
    ],
  },
  {
    id: 'intents',
    title: 'Summarize support intents, Sept',
    project: 'Support triage',
    sensitivity: 'Internal',
    pinned: false,
    calibrated: false,
    intent: null,
    minutesAgo: 120,
    messages: [
      user('Summarize September support intents by product line. Anything trending up?'),
      assistant(routes(['model', 'claude-sonnet-4.5'], ['model', 'Support Intent XL'], ['server', 'Postgres']), [
        tool('i1', 'query', 'Postgres · support_dw', '48,210 conversations · 312 intents', 'Internal', {
          args: {
            sql: "select intent, product_line, count(*) from conversations where month = '2026-09' group by 1, 2",
          },
          result: '312 intents across 6 product lines',
        }),
        text(
          'Billing disputes rose 18% month over month, concentrated in the Payments product line. Everything else is within ±4%.',
        ),
      ]),
      user('Break the billing disputes down by product line and show me the trend.'),
      assistant(routes(['model', 'claude-haiku-4.5'], ['server', 'Postgres · support_dw']), [
        tool('i2', 'query', 'Postgres · support_dw', 'intent = billing.* · grouped by product_line, week', 'Internal', {
          args: {
            sql: "select product_line, week, count(*) from conversations where intent like 'billing.%' group by 1, 2",
          },
          result: '4 product lines × 4 weeks',
        }),
        chart(
          'Billing disputes by product line · September',
          ['Payments', 100, '2,140'],
          ['Subscriptions', 46, '980'],
          ['Marketplace', 21, '450'],
          ['Invoicing', 12, '260'],
        ),
        table(
          ['Week', 'Payments', 'Subscriptions', 'All billing'],
          ['Sep 1', '410', '240', '890'],
          ['Sep 8', '470', '236', '940'],
          ['Sep 15', '590', '251', '1,120'],
          ['Sep 22', '670', '253', '1,210'],
        ),
        text(
          'The rise is almost entirely Payments, starting the week of Sep 15. That lines up with the 3DS rollout on Sep 12; worth checking with the Payments team before we change routing.',
        ),
      ]),
      user('Save that as an artifact and draft a note to #payments.'),
      assistant(routes(['model', 'claude-sonnet-4.5'], ['server', 'Slack']), [
        artifact('September intents summary', 'Doc', '640 words · chart + table embedded'),
        tool('i3', 'post_message', 'Slack · #payments', 'Post the summary with the chart (write)', 'Internal', {
          status: 'pending',
          write: true,
          args: { channel: '#payments', text: 'September intents summary · 640 words', attachments: '1 · chart.png' },
        }),
        text('Saved. The post to #payments is waiting for your approval.'),
      ]),
    ],
  },
  {
    id: 'rfc',
    title: 'Draft RFC: tool approval tiers',
    project: null,
    sensitivity: 'Internal',
    pinned: false,
    calibrated: false,
    intent: null,
    minutesAgo: DAY + 180,
    messages: [
      user(
        'Draft an RFC proposing approval tiers for write tools. Base it on what we already have in Governance and the incidents from Q3.',
      ),
      assistant(routes(['model', 'claude-opus-4.1'], ['server', 'Governance'], ['server', 'Postgres · incidents_dw']), [
        text('Pulling the current policies and the Q3 incident log first.'),
        tool('r1', 'read_policies', 'Governance', '4 policies · 4 tiers · last changed Aug 28', 'Internal'),
        tool('r2', 'query', 'Postgres · incidents_dw', '7 incidents involving write tools · Jul–Sep', 'Internal'),
        steps(
          'Plan',
          ['Summarize current state', 'done'],
          ['Propose three approval tiers', 'done'],
          ['Map existing write tools to tiers', 'done'],
          ['Rollout and break-glass', 'done'],
        ),
        artifact('approval_tiers_rfc.md', 'Doc', 'v1 · 1,420 words · 4 sections'),
        text('The core proposal:'),
        table(
          ['Tier', 'Who approves', 'Examples'],
          ['T1 · Reversible', 'Chat owner', 'post_message, comment, write_file in scratch'],
          ['T2 · Business impact', 'Owner + team lead', 'upsert_sku, create_issue, update_record'],
          ['T3 · Irreversible', 'Two named approvers', 'delete_record, send_email (external), payments'],
        ),
        text('Want a section on break-glass access for on-call?'),
      ]),
      user('Yes, and use the September Slack post_message incident as the motivating example.'),
      assistant(routes(['model', 'claude-opus-4.1']), [
        text(
          'Added both. The incident section quotes the timeline from the postmortem; the break-glass section proposes a 30-minute, audited override for on-call with automatic T2 review afterwards.',
        ),
        {
          type: 'code',
          language: 'markdown',
          text: '## Motivating incident — Sep 9\n\nAn agent posted a confidential threshold table to #risk-ops\nwithout approval because the write tool was allow-listed\nat the server level, not per tool.\n\n**Impact:** 41 external contractors could read the channel.\n**Fix:** per-tool approval (shipped Sep 12).\n**Gap:** no tiering, so every write now interrupts the user.',
        },
        artifact('approval_tiers_rfc.md', 'Doc', 'v2 · 1,980 words · 6 sections'),
        text('Ready for review. I can open it as a PR against the governance docs repo when you want.'),
      ]),
    ],
  },
  {
    id: 'invoice',
    title: 'Invoice extractor eval results',
    project: null,
    sensitivity: 'Confidential',
    pinned: false,
    calibrated: false,
    intent: null,
    minutesAgo: DAY + 300,
    messages: [
      user('How did Invoice Extractor v2.1 do on the September holdout versus v2.0?'),
      assistant(
        routes(['model', 'claude-haiku-4.5'], ['model', 'Invoice Extractor v2.1'], ['dataset', 'Invoice corpus v4']),
        [
          tool('v1', 'run_eval', 'Invoice Extractor', 'holdout_2026-09 · 180 docs · 28 field types', 'Confidential'),
          chart(
            'Field F1 · v2.1',
            ['Vendor', 98, '0.98'],
            ['Total', 97, '0.97'],
            ['Dates', 95, '0.95'],
            ['Line items', 91, '0.91'],
            ['Tax', 89, '0.89'],
          ),
          table(
            ['Metric', 'v2.0', 'v2.1', 'Change'],
            ['Field F1 (macro)', '0.93', '0.95', '+0.02'],
            ['Line-item F1', '0.93', '0.91', '−0.02'],
            ['Docs with zero errors', '61%', '68%', '+7 pts'],
            ['p95 latency', '1.9 s', '1.4 s', '−0.5 s'],
          ),
          text(
            'Overall better, with one regression: line items dropped two points, all of it on multi-page purchase orders where the table header repeats.',
          ),
          artifact('eval_invoice_v2.1.ipynb', 'Code', 'notebook · 14 cells · per-document errors'),
        ],
      ),
      user('Open a ticket for the multi-page regression and assign it to Document Intel.'),
      assistant(routes(['model', 'claude-sonnet-4.5'], ['server', 'GitHub']), [
        tool(
          'v2',
          'create_issue',
          'GitHub · docs-intel/invoice-extractor',
          'Line-item F1 regression on multi-page POs (write)',
          'Internal',
          {
            status: 'pending',
            write: true,
            args: {
              repo: 'docs-intel/invoice-extractor',
              title: 'Line-item F1 regression on multi-page POs (v2.1)',
              assignees: 'team: document-intel',
              labels: 'regression, eval',
            },
          },
        ),
        text(
          'Drafted the issue with the 11 failing document IDs and the diff against v2.0. It needs your approval to create.',
        ),
      ]),
    ],
  },
  {
    id: 'sku',
    title: 'Onboarding workflow for new SKUs',
    project: 'SKU onboarding',
    sensitivity: 'Internal',
    pinned: false,
    calibrated: false,
    intent: null,
    minutesAgo: 4 * DAY + 60,
    messages: [
      user('Run the SKU onboarding workflow for 88213-BLK and show me where it is.'),
      assistant(routes(['model', 'claude-sonnet-4.5'], ['flow', 'SKU onboarding']), [
        {
          type: 'workflow',
          name: 'SKU onboarding',
          status: 'Waiting for approval',
          steps: [
            { label: 'New SKU in catalog', status: 'done' },
            { label: 'Fetch supplier sheet', status: 'done' },
            { label: 'Extract attributes', status: 'done' },
            { label: 'Initial demand forecast', status: 'done' },
            { label: 'Pricing review', status: 'awaiting' },
            { label: 'Publish to PIM', status: 'pending' },
          ],
        },
        text(
          'Four of six steps are done. It is paused at Pricing review because the forecast touches Confidential margin data; the Pricing team was pinged 4 minutes ago.',
        ),
      ]),
      user('What did the forecaster say?'),
      assistant(routes(['model', 'claude-haiku-4.5'], ['model', 'Demand Forecaster v2.5']), [
        tool('k1', 'forecast', 'Demand Forecaster', 'sku=88213-BLK · horizon 8 weeks · quantiles', 'Confidential'),
        chart(
          'Weekly units · P50',
          ['W1', 62, '980'],
          ['W2', 74, '1,160'],
          ['W3', 79, '1,240'],
          ['W4', 82, '1,290'],
          ['W5', 80, '1,260'],
          ['W6', 77, '1,210'],
          ['W7', 73, '1,150'],
          ['W8', 70, '1,100'],
        ),
        table(
          ['Quantile', 'Units / wk', 'Note'],
          ['P10', '980', 'Low scenario'],
          ['P50', '1,240', 'Planning number'],
          ['P90', '1,610', 'Promo upside'],
        ),
        text(
          'Similar launches in this category landed between P50 and P90 in their first month. The initial buy on the sheet is 900 units, which is below P10.',
        ),
      ]),
    ],
  },
  {
    id: 'churn',
    title: 'Compare churn models v1.8 vs v2',
    project: null,
    sensitivity: 'Internal',
    pinned: false,
    calibrated: false,
    intent: null,
    minutesAgo: 4 * DAY + 240,
    messages: [
      user('Compare Churn Propensity v1.8 against the v2 candidate on the 90-day window.'),
      assistant(
        routes(['model', 'claude-sonnet-4.5'], ['model', 'Churn Propensity'], ['skill', 'Churn narrative v1.2']),
        [
          tool(
            'c1',
            'compare_evals',
            'Models',
            'v1.8.0 vs v2.0.0-rc2 · 90-day holdout · 12,400 accounts',
            'Confidential',
          ),
          table(
            ['Metric', 'v1.8', 'v2.0-rc2'],
            ['AUC-ROC', '0.89', '0.92'],
            ['Brier score', '0.040', '0.034'],
            ['Recall @ top 5%', '41%', '49%'],
            ['Feature count', '38', '52'],
          ),
          skill(
            'Churn narrative',
            'v1.2',
            'Explained the lift in plain language: most of it comes from the new support-contact features, concentrated in mid-market accounts.',
          ),
          list(
            'v2 catches 8 more at-risk accounts per hundred flagged, with slightly better calibration.',
            'The new features come from the support warehouse, so the model becomes Confidential rather than Internal.',
            'No fairness regression across region or plan tier.',
          ),
          text('Recommendation: promote v2.0 behind the same approval tier as Support Intent XL.'),
          artifact('churn_compare.csv', 'Data', '4 metrics · 2 versions'),
        ],
      ),
      user('Draft the promotion request.'),
      assistant(routes(['model', 'claude-sonnet-4.5']), [
        artifact('Promotion request — Churn Propensity v2.0', 'Doc', '520 words · metrics table attached'),
        text(
          'Drafted with the comparison table and the tier change called out. Submit it from Governance when you are ready; it will land in the queue as a model version bump.',
        ),
      ]),
    ],
  },
];
