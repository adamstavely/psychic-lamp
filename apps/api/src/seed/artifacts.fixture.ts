import type { ArtifactBody, Sensitivity } from '@donovan/contracts';
import { artifactId } from './artifact-ids.js';

// The prototype's artifacts (fictional), converted to the contract's shapes. Seeded once per person with their chats.

export interface SeedArtifact {
  id: string;
  name: string;
  sensitivity: Sensitivity;
  chatId: string | null;
  project: string | null;
  sharedWith: string[];
  /** Each version's note, and how many minutes before now it was made. */
  versions: { note: string; minutesAgo: number }[];
  sources: string[];
  body: ArtifactBody;
}

const DAY = 24 * 60;
const a = (name: string, rest: Omit<SeedArtifact, 'id' | 'name'>): SeedArtifact => ({
  id: artifactId(name),
  name,
  ...rest,
});

export const SEED_ARTIFACTS: SeedArtifact[] = [
  a('Rollout note — Fraud Sentinel v3.2', {
    sensitivity: 'Confidential',
    chatId: 'fraud',
    project: 'Fraud rollout',
    sharedWith: ['Riya Mehta', 'Jon Park', 'Kemi Okafor'],
    versions: [
      { note: 'First draft from shadow-mode findings', minutesAgo: 59 },
      { note: 'Added rollback trigger and owner', minutesAgo: 30 },
    ],
    sources: ['Fraud Sentinel v3.2 model card', 'Shadow-mode results, Sep–Oct', 'Postgres · fraud_dw.alerts'],
    body: {
      kind: 'Doc',
      blocks: [
        {
          type: 'callout',
          tone: 'warning',
          title: 'Decision needed by Thursday 17:00',
          text: 'Risk Ops sign-off is the only open approval.',
        },
        { type: 'heading', text: 'Decision' },
        {
          type: 'paragraph',
          text: 'Fraud Sentinel v3.2 goes to 10% of card-not-present traffic on Friday 06:00 UTC, EU region first. Merchant m_88213 is excluded until its BIN range is reviewed.',
        },
        { type: 'heading', text: 'Findings' },
        {
          type: 'list',
          items: [
            'A 212-transaction cluster from merchant m_88213 scored 0.97+; all share a BIN range added Oct 9.',
            'False-positive rate 0.58% on the 7-day holdout, inside the 0.8% guardrail.',
            'p99 latency 44 ms during the 02:00 UTC batch window, 3 ms over SLO.',
          ],
        },
        {
          type: 'table',
          columns: ['Metric', 'v3.1', 'v3.2', 'Guardrail'],
          rows: [
            ['Fraud caught', '71.2%', '79.0%', '—'],
            ['False-positive rate', '0.61%', '0.58%', '≤ 0.80%'],
            ['p99 latency', '38 ms', '44 ms', '≤ 41 ms'],
          ],
          flag: [2, 2],
        },
        { type: 'heading', text: 'Rollback trigger', since: 2 },
        {
          type: 'paragraph',
          text: 'Roll back automatically if the false-positive rate exceeds 0.8% over 15 minutes, or p99 latency stays above 41 ms for 15 minutes.',
          since: 2,
        },
        {
          type: 'facts',
          rows: [
            ['Owner', 'Risk ML on-call'],
            ['Escalation', '#risk-ops'],
            ['Review', 'Monday 10:00'],
          ],
          since: 2,
        },
      ],
    },
  }),
  a('cohort.json', {
    sensitivity: 'Confidential',
    chatId: 'fraud',
    project: 'Fraud rollout',
    sharedWith: ['Riya Mehta'],
    versions: [{ note: 'Cohort for 10% rollout', minutesAgo: 31 }],
    sources: ['Rollout plan draft', 'Postgres · fraud_dw.alerts'],
    body: {
      kind: 'Data',
      format: 'json',
      columns: ['key', 'value'],
      rows: [
        ['traffic_pct', '10'],
        ['region', 'EU'],
        ['channel', 'card_not_present'],
        ['start', '2026-10-23T06:00Z'],
        ['exclude_merchants', '["m_88213"]'],
      ],
      raw: '{\n  "traffic_pct": 10,\n  "region": "EU",\n  "channel": "card_not_present",\n  "start": "2026-10-23T06:00Z",\n  "exclude_merchants": ["m_88213"]\n}',
    },
  }),
  a('September intents summary', {
    sensitivity: 'Internal',
    chatId: 'intents',
    project: 'Support triage',
    sharedWith: ['Sam Adeyemi'],
    versions: [{ note: 'Generated from support_dw', minutesAgo: 115 }],
    sources: ['Postgres · support_dw', 'Ticket intents, labelled', 'Routing policy v7'],
    body: {
      kind: 'Doc',
      blocks: [
        { type: 'heading', text: 'Headline' },
        {
          type: 'paragraph',
          text: 'Billing disputes rose 18% month over month. The increase is concentrated in Payments and begins the week of September 15, coinciding with the 3DS rollout.',
        },
        { type: 'heading', text: 'Disputes by product line' },
        {
          type: 'bars',
          items: [
            { label: 'Payments', value: 2140 },
            { label: 'Subscriptions', value: 980 },
            { label: 'Marketplace', value: 450 },
            { label: 'Invoicing', value: 260 },
          ],
        },
        { type: 'paragraph', text: 'Everything outside Payments is within ±4% of August.' },
        { type: 'heading', text: 'Recommendation' },
        {
          type: 'callout',
          tone: 'info',
          title: 'Hold routing changes',
          text: 'Wait until Payments confirms whether 3DS failures are producing duplicate-charge tickets. Re-run this summary on October 1.',
        },
      ],
    },
  }),
  a('approval_tiers_rfc.md', {
    sensitivity: 'Internal',
    chatId: 'rfc',
    project: null,
    sharedWith: ['Governance', 'Platform'],
    versions: [
      { note: 'First draft · 4 sections', minutesAgo: DAY + 220 },
      { note: 'Added motivating incident and break-glass', minutesAgo: DAY + 180 },
    ],
    sources: ['Postgres · incidents_dw', 'Sep 9 postmortem', 'Governance policy library'],
    body: {
      kind: 'Doc',
      blocks: [
        {
          type: 'facts',
          rows: [
            ['Status', 'Draft for review'],
            ['Authors', 'You, Donovan'],
            ['Reviewers', 'Governance, Platform'],
          ],
        },
        { type: 'heading', text: 'Motivation' },
        {
          type: 'paragraph',
          text: 'Per-tool approval stopped the September incident but now interrupts users on every write. Tiering lets reversible writes proceed with light review while irreversible ones get two approvers.',
        },
        { type: 'heading', text: 'Motivating incident — Sep 9', since: 2 },
        {
          type: 'paragraph',
          text: 'An agent posted a confidential threshold table to #risk-ops without approval because the write tool was allow-listed for the whole workspace.',
          since: 2,
        },
        { type: 'heading', text: 'Proposed tiers' },
        {
          type: 'table',
          columns: ['Tier', 'Who approves', 'Examples'],
          rows: [
            ['T1 · Reversible', 'Chat owner', 'post_message, comment, write_file in scratch'],
            ['T2 · Business impact', 'Owner + team lead', 'upsert_sku, update_record'],
            ['T3 · Irreversible', 'Two named approvers', 'delete, payouts, model promotion'],
          ],
        },
        { type: 'heading', text: 'Break-glass', since: 2 },
        {
          type: 'paragraph',
          text: 'On-call may override T2 for 30 minutes. Every call is audited and reviewed automatically afterwards.',
          since: 2,
        },
        { type: 'heading', text: 'Rollout' },
        {
          type: 'list',
          items: [
            'Map existing tools in Governance.',
            'Default unknown tools to T2.',
            'Ship behind a workspace flag for two weeks.',
          ],
        },
      ],
    },
  }),
  a('eval_invoice_v2.1.ipynb', {
    sensitivity: 'Confidential',
    chatId: 'invoice',
    project: null,
    sharedWith: ['Document Intel'],
    versions: [{ note: '14 cells · ran in 3m 12s', minutesAgo: DAY + 300 }],
    sources: ['docs-intel/invoice-corpus v4', 'Invoice Extractor v2.1.0'],
    body: {
      kind: 'Code',
      language: 'python',
      cells: [
        { type: 'markdown', text: 'Invoice Extractor v2.1 · September holdout. Compares field-level F1 against v2.0.' },
        {
          type: 'code',
          text: 'from donovan import load_model, load_dataset\n\nmodel = load_model("docs-intel/invoice-extractor", revision="v2.1.0")\nholdout = load_dataset("docs-intel/invoice-corpus", revision="v4")["test"]',
        },
        {
          type: 'code',
          text: 'preds = model.extract(holdout)\nreport = evaluate(preds, holdout.labels, by="field_type")\nreport.sort_values("f1").head()',
        },
        {
          type: 'output',
          text: 'field_type     f1    delta_vs_v2.0\ntax            0.89  +0.01\nline_items     0.91  -0.02\ndates          0.95  +0.01\ntotal          0.97  +0.02\nvendor         0.98  +0.01',
        },
        {
          type: 'markdown',
          text: 'The line-item regression is entirely on multi-page purchase orders where the table header repeats.',
        },
        { type: 'code', text: 'errors = report.errors(field="line_items")\nerrors.groupby("page_count").size()' },
        { type: 'output', text: 'page_count\n1     12\n2     31\n3+    58' },
      ],
    },
  }),
  a('churn_compare.csv', {
    sensitivity: 'Internal',
    chatId: 'churn',
    project: null,
    sharedWith: [],
    versions: [{ note: '4 metrics · 2 versions', minutesAgo: 4 * DAY + 252 }],
    sources: ['Model registry · churn-propensity'],
    body: {
      kind: 'Data',
      format: 'csv',
      columns: ['metric', 'v1.8', 'v2.0-rc2', 'change'],
      rows: [
        ['auc_roc', '0.89', '0.92', '+0.03'],
        ['brier', '0.040', '0.034', '−0.006'],
        ['recall_top5', '0.41', '0.49', '+0.08'],
        ['features', '38', '52', '+14'],
      ],
      raw: 'metric,v1.8,v2.0-rc2,change\nauc_roc,0.89,0.92,+0.03\nbrier,0.040,0.034,-0.006\nrecall_top5,0.41,0.49,+0.08\nfeatures,38,52,+14',
    },
  }),
  a('Promotion request — Churn Propensity v2.0', {
    sensitivity: 'Internal',
    chatId: 'churn',
    project: null,
    sharedWith: [],
    versions: [{ note: 'Drafted with metrics table', minutesAgo: 4 * DAY + 240 }],
    sources: ['churn_compare.csv', 'Model card · Churn Propensity'],
    body: {
      kind: 'Doc',
      blocks: [
        { type: 'heading', text: 'Request' },
        {
          type: 'paragraph',
          text: 'Promote Churn Propensity v2.0-rc2 to production, replacing v1.8. The new version adds 14 features from billing events and moves the model from Internal to Confidential.',
        },
        {
          type: 'table',
          columns: ['Metric', 'v1.8', 'v2.0-rc2'],
          rows: [
            ['AUC-ROC', '0.89', '0.92'],
            ['Brier score', '0.040', '0.034'],
            ['Recall @ top 5%', '0.41', '0.49'],
          ],
        },
        {
          type: 'callout',
          tone: 'warning',
          title: 'Tier change',
          text: 'Billing features raise the data tier to Confidential. Downstream dashboards need access review.',
        },
      ],
    },
  }),
];
