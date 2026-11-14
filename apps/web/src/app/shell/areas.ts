import type { RegistryKind } from '@donovan/contracts';
import type { IconName } from '../core/icons';

export interface Area {
  id: string;
  label: string;
  path: string;
  icon: IconName;
}

/** Assist mode's places, in the prototype's order. */
export const ASSIST_AREAS: readonly Area[] = [
  { id: 'brief', label: 'Daily Brief', path: '/brief', icon: 'sun' },
  { id: 'chats', label: 'Chats', path: '/chats', icon: 'chat' },
  { id: 'projects', label: 'Projects', path: '/projects', icon: 'folder' },
  { id: 'artifacts', label: 'Artifacts', path: '/artifacts', icon: 'artifact' },
];

export interface BuildArea extends Area {
  /** A one-line account of what the area holds. */
  description: string;
  /** The catalog's heading and the line under it (the prototype's). */
  title: string;
  blurb: string;
  /** The registry kind it lists; Insights and Governance list none. */
  kind: RegistryKind | null;
}

/** Build mode's places, in the prototype's order. */
export const BUILD_AREAS: readonly BuildArea[] = [
  {
    id: 'skills',
    label: 'Skills',
    path: '/build/skills',
    title: 'Turn what you know into skills.',
    blurb: 'Capture a process, extract its principles, test it, and publish it for chat and workflows.',
    icon: 'skill',
    kind: 'skill',
    description: 'Procedural knowledge Donovan loads for a task: how your teams write, review and decide.',
  },
  {
    id: 'servers',
    label: 'MCP Servers',
    path: '/build/servers',
    title: 'Connect tools and data.',
    blurb: 'Servers expose tools an agent can call. Verified servers are reviewed by Governance.',
    icon: 'server',
    kind: 'server',
    description: 'Tools Donovan can call, from files and databases to Slack and GitHub, each with its own permissions.',
  },
  {
    id: 'agents',
    label: 'Agents',
    path: '/build/agents',
    title: 'Agents that work with your skills and servers.',
    blurb: 'An agent is a model plus servers, skills and an autonomy level.',
    icon: 'agent',
    kind: 'agent',
    description: 'Skills, servers and a model packaged to do one job, with a set level of autonomy.',
  },
  {
    id: 'workflows',
    label: 'Workflows',
    path: '/build/workflows',
    title: 'Automate multi-step work.',
    blurb: 'Node graphs that chain triggers, tools, models and approvals, with live run state.',
    icon: 'workflow',
    kind: 'workflow',
    description: 'Steps that run on a trigger or a schedule, pausing for approval where the data needs it.',
  },
  {
    id: 'models',
    label: 'Models',
    path: '/build/models',
    title: 'Foundation and domain models, one catalog.',
    blurb: 'Browse, evaluate and use models from every team.',
    icon: 'model',
    kind: 'model',
    description: 'Foundation models and the ones your teams trained, with their evaluations and model cards.',
  },
  {
    id: 'datasets',
    label: 'Datasets',
    path: '/build/datasets',
    title: 'Versioned data for training and evaluation.',
    blurb: 'Each dataset has splits, a schema and lineage to the models trained on it.',
    icon: 'database',
    kind: 'dataset',
    description: 'The data models are trained and evaluated on, with schemas and who uses them.',
  },
  {
    id: 'spaces',
    label: 'Spaces',
    path: '/build/spaces',
    title: 'Interactive demos in front of models.',
    blurb: 'Try a model with your own input before wiring it into chat or a workflow.',
    icon: 'space',
    kind: 'space',
    description: 'Small apps that put a model in front of people to try.',
  },
  {
    id: 'collections',
    label: 'Collections',
    path: '/build/collections',
    title: 'Curated bundles, attached in one step.',
    blurb: 'Bundles of skills, servers, models and agents. A collection inherits its most sensitive member.',
    icon: 'collection',
    kind: 'collection',
    description: 'Curated sets of skills, servers, models and more, at the tier of their most sensitive member.',
  },
  {
    id: 'prompts',
    label: 'Prompts',
    path: '/build/prompts',
    title: 'Store, version and test your prompts.',
    blurb: 'Every edit is saved as a version you can test against the suite before publishing.',
    icon: 'prompt',
    kind: 'prompt',
    description: 'Versioned, tested prompts your teams reuse.',
  },
  {
    id: 'insights',
    label: 'Insights',
    path: '/build/insights',
    title: 'How Donovan is used.',
    blurb: 'Messages, models and approvals across the workspace.',
    icon: 'insights',
    kind: null,
    description: 'How Donovan is used: messages, models and what was approved.',
  },
  {
    id: 'governance',
    label: 'Governance',
    path: '/build/governance',
    title: 'Review and policy.',
    blurb: 'What people register waits here for two reviewers; policies and tiers decide what needs approval.',
    icon: 'governance',
    kind: null,
    description: 'Review what people register, and the policies and tiers that decide what needs approval.',
  },
];

/** The Build area that lists a kind. */
export function buildAreaFor(kind: RegistryKind): BuildArea {
  return BUILD_AREAS.find((a) => a.kind === kind)!;
}

export type Mode = 'assist' | 'build';

/** Which mode a URL is in. */
export function modeFor(url: string): Mode {
  return /^\/build(\/|$|[?#])/.test(url) ? 'build' : 'assist';
}

/** Which area a URL belongs to: the first path segment in Assist, the second in Build, when it names one. */
export function areaFor(url: string): string | null {
  const parts = url.split(/[?#]/)[0]!.split('/').filter(Boolean);
  if (parts[0] === 'build') return BUILD_AREAS.some((a) => a.id === parts[1]) ? parts[1]! : null;
  const first = parts[0] ?? '';
  return ASSIST_AREAS.some((a) => a.id === first) ? first : null;
}
