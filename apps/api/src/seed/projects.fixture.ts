import type { Sensitivity, SourceKind } from '@donovan/contracts';

// The prototype's projects (fictional). Sources and notes are seeded per person; the guide, questions, answer and
// suggestions are canned content looked up by project id. In guides and answers a number cites the project's source at
// that position (1-based), as the prototype writes them.

export type Cited = (string | number)[];

export interface SeedProject {
  id: string;
  name: string;
  team: string;
  sensitivity: Sensitivity;
  calibrated: boolean;
  description: string;
  minutesAgo: number;
  sources: { kind: SourceKind; title: string; meta: string }[];
  guide: Cited;
  questions: string[];
  answer: Cited;
  outputs: { title: string; meta: string }[];
  suggestions: { kind: SourceKind; title: string; meta: string }[];
  workflows: { name: string; meta: string }[];
}

const DAY = 24 * 60;

export const SEED_PROJECTS: SeedProject[] = [
  {
    id: 'fraud-rollout',
    name: 'Fraud rollout',
    team: 'Risk ML',
    sensitivity: 'Confidential',
    calibrated: false,
    description: 'Everything around moving Fraud Sentinel v3.2 into production.',
    minutesAgo: 59,
    sources: [
      { kind: 'pdf', title: 'Fraud Sentinel v3.2 model card', meta: 'PDF · 14 pages' },
      { kind: 'sheet', title: 'Shadow-mode results, Sep–Oct', meta: 'Sheet · 41k rows' },
      { kind: 'doc', title: 'Rollout plan draft', meta: 'Doc · edited yesterday' },
      { kind: 'slack', title: '#risk-ops thread: threshold debate', meta: 'Slack · 63 messages' },
      { kind: 'connector', title: 'Postgres · fraud_dw.alerts', meta: 'Live connector · read-only' },
      { kind: 'web', title: 'Regulator guidance on automated declines', meta: 'Web · fca.org.uk' },
    ],
    guide: [
      'Fraud Sentinel v3.2 is ready to move from shadow mode to production. Over six weeks of shadow traffic it caught 11% more confirmed fraud than v3.1 at the same false-positive rate',
      2,
      '. The open question is the decline threshold: the rollout plan proposes 0.97',
      3,
      ', while Risk Ops argues for 0.95 with manual review on the band between',
      4,
      '. Automated declines need a documented appeal path under current guidance',
      6,
      '.',
    ],
    questions: [
      'What changes between v3.1 and v3.2?',
      'Summarize the threshold debate',
      'Which cohorts have the highest false-positive rate?',
    ],
    answer: [
      'The largest false-positive rates in shadow mode are in new accounts under 30 days old (2.1%) and cross-border card-not-present transactions (1.6%)',
      2,
      '. Both sit above the 0.8% guardrail in the rollout plan',
      3,
      '. The model card flags thin transaction history as a known weakness for the first group',
      1,
      ', and the live alerts table shows the same pattern this week',
      5,
      '.',
    ],
    outputs: [
      { title: 'Rollout readiness brief', meta: 'From 6 sources' },
      { title: 'False-positive rate by cohort', meta: 'From 2 sources' },
    ],
    suggestions: [
      { kind: 'web', title: 'Card scheme rules for real-time declines (2026 update)', meta: 'Web · 9 min read' },
      { kind: 'pdf', title: 'Internal audit: Sentinel v3.0 post-launch review', meta: 'Shared drive · PDF' },
      { kind: 'slack', title: '#fraud-ml: GNN feature latency', meta: 'Slack · 22 messages' },
    ],
    workflows: [
      { name: 'Weekly fraud digest', meta: 'Fridays 07:00 · posts to #risk-ops' },
      { name: 'Score drift check', meta: 'On new data in fraud_dw' },
    ],
  },
  {
    id: 'supplier-risk',
    name: 'Supplier risk',
    team: 'Procurement',
    sensitivity: 'Confidential',
    calibrated: true,
    description: 'Sourcing decisions for critical components, analysed in Calibrated mode.',
    minutesAgo: 8,
    sources: [
      { kind: 'doc', title: 'Workspace docs · Supply chain', meta: 'Library · 5 documents' },
      { kind: 'pdf', title: 'USGS Minerals Yearbook 2023 — Rare Earths', meta: 'PDF · US Geological Survey' },
      { kind: 'pdf', title: "China's Critical Mineral Export Controls", meta: 'PDF · CSIS' },
      {
        kind: 'pdf',
        title: 'Rare Earth Elements: The Global Supply Chain',
        meta: 'PDF · Congressional Research Service',
      },
    ],
    guide: [
      'Refining of rare earths is concentrated in China, with the Baotou cluster the largest single complex',
      2,
      '. Export controls so far cover gallium, germanium and graphite but not magnet-grade NdFeB',
      3,
      ', and past disruptions resolved within about two years as buyers substituted and recycled',
      4,
      '.',
    ],
    questions: [
      'Is single-sourcing defensible through 2027?',
      'What would a second source cost?',
      'Which claims rest on model knowledge alone?',
    ],
    answer: [
      'On resilience, single-sourcing is hard to defend: processing concentration would outlast any one export regime',
      2,
      3,
      '. On cost it holds up, because past disruptions were short',
      4,
      '. The defensible position is a qualified second source by late 2026.',
    ],
    outputs: [],
    suggestions: [
      { kind: 'web', title: 'MP Materials 2027 capacity update', meta: 'Web · investor relations' },
      { kind: 'pdf', title: 'IEA Critical Minerals Outlook 2026', meta: 'PDF · IEA' },
    ],
    workflows: [],
  },
  {
    id: 'support-triage',
    name: 'Support triage',
    team: 'Support AI',
    sensitivity: 'Internal',
    calibrated: false,
    description: 'Intent classification, routing rules and weekly summaries.',
    minutesAgo: DAY + 120,
    sources: [
      { kind: 'dataset', title: 'Ticket intents, labelled', meta: 'Dataset · 182k rows' },
      { kind: 'doc', title: 'Routing policy v7', meta: 'Doc · 11 pages' },
      { kind: 'connector', title: 'Postgres · support_dw', meta: 'Live connector · read-only' },
      { kind: 'sheet', title: 'Weekly CSAT by queue', meta: 'Sheet · 52 weeks' },
      { kind: 'pdf', title: 'Support Intent XL eval report', meta: 'PDF · 9 pages' },
    ],
    guide: [
      'Support Intent XL routes about 74% of new tickets without a human touch',
      5,
      '. Routing follows policy v7, which sends billing disputes and account closures to tier 2 regardless of confidence',
      2,
      '. CSAT dipped two points in the last three weeks on the returns queue',
      4,
      ', which also has the lowest intent accuracy in the labelled set',
      1,
      '.',
    ],
    questions: [
      'Why did returns CSAT drop?',
      'Which intents get misrouted most?',
      'Draft a change to routing policy v7',
    ],
    answer: [
      'Returns tickets are most often confused with exchange requests: 18% of true returns are labelled as exchanges',
      1,
      '. Policy v7 sends exchanges to a different queue with a slower SLA',
      2,
      ', which lines up with the CSAT drop starting in week 41',
      4,
      '.',
    ],
    outputs: [{ title: 'Weekly triage summary', meta: 'From 4 sources' }],
    suggestions: [
      { kind: 'web', title: 'Benchmarks for first-contact resolution in retail', meta: 'Web · industry report' },
      { kind: 'doc', title: 'Returns process redesign notes', meta: 'Shared drive · Doc' },
    ],
    workflows: [{ name: 'Support ticket triage', meta: 'Runs hourly · 5 steps' }],
  },
  {
    id: 'sku-onboarding',
    name: 'SKU onboarding',
    team: 'Demand Science',
    sensitivity: 'Internal',
    calibrated: false,
    description: 'Automating new SKU setup from supplier sheets to the PIM.',
    minutesAgo: 3 * DAY,
    sources: [
      { kind: 'sheet', title: 'supplier_88213.xlsx', meta: 'Sheet · 31 attributes' },
      { kind: 'connector', title: 'PIM · product records', meta: 'Live connector · read/write' },
      { kind: 'doc', title: 'Attribute mapping guide', meta: 'Doc · 6 pages' },
      { kind: 'pdf', title: 'Demand Forecaster v2.5 notes', meta: 'PDF · 4 pages' },
    ],
    guide: [
      'New SKUs arrive as supplier sheets with 25–40 attributes',
      1,
      '. The mapping guide covers 29 of the 31 columns in the latest sheet; colour family and care code have no mapping yet',
      3,
      '. Forecasts run before pricing review so buyers see expected volume',
      4,
      '.',
    ],
    questions: [
      'Which attributes are unmapped?',
      'What does the forecast say for SKU 88213?',
      'List the steps that need a human',
    ],
    answer: [
      'Two columns in supplier_88213.xlsx have no mapping: colour family and care code',
      1,
      3,
      '. The PIM accepts both as free text today',
      2,
      ', so the workflow can publish but filters on the storefront will miss them.',
    ],
    outputs: [],
    suggestions: [
      { kind: 'pdf', title: 'Supplier data standard v3', meta: 'Shared drive · PDF' },
      { kind: 'web', title: 'GS1 attribute definitions', meta: 'Web · gs1.org' },
    ],
    workflows: [{ name: 'SKU onboarding', meta: '6 steps · ran 2h ago' }],
  },
];

/** Libraries published to the whole organisation (fictional). */
export const ORG_LIBRARIES = [
  { id: 'q4-planning', name: 'Q4 planning hub', team: 'Strategy Office', sourceCount: 34, daysAgo: 16 },
  { id: 'model-risk-policy', name: 'Model risk policy library', team: 'Governance', sourceCount: 58, daysAgo: 32 },
  { id: 'customer-research', name: 'Customer research 2026', team: 'Insights team', sourceCount: 112, daysAgo: 44 },
  { id: 'data-platform-onboarding', name: 'Onboarding: data platform', team: 'Platform', sourceCount: 21, daysAgo: 86 },
] as const;
