import type { ChatModel } from '@adamstavely/trenchcoat/chat-composer';
import type { ModelChoice } from '@donovan/contracts';

/** Auto first: routing picks per message; the rest pin a message to one model. */
export const COMPOSER_MODELS: ChatModel[] = [
  { id: 'auto', name: 'Auto', description: 'Donovan picks skills, tools and a model per message' },
  { id: 'claude-sonnet-4.5', name: 'Claude Sonnet 4.5', description: 'Balanced: the default for most work' },
  { id: 'claude-opus-4.1', name: 'Claude Opus 4.1', description: 'Deepest reasoning, slower' },
  { id: 'claude-haiku-4.5', name: 'Claude Haiku 4.5', description: 'Fastest, for quick lookups' },
];

export const FEEDBACK_REASONS = [
  'Not accurate',
  'Not helpful',
  'Wrong tool or source',
  'Too long',
  'Unsafe or off-policy',
];

/** History-state key for a first message the home page hands to the new chat. */
export const PENDING_SEND = 'donovanPendingSend';
export interface PendingSend {
  text: string;
  model: ModelChoice;
  /** Artifacts attached on the home page, by id. */
  attachments: string[];
}
