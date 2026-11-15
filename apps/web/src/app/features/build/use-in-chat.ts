import type { RegistryKind } from '@donovan/contracts';
import { COMPOSER_MODELS } from '../chats/composer';

/**
 * What "Use in chat" (or "Run in chat") puts in a new chat: a message naming the item, and the model, for a model the
 * composer offers. The person finishes the message and sends it.
 */
export function chatStart(
  item: { kind: RegistryKind; name: string; slug: string },
  model?: string,
): {
  q: string;
  model?: string;
} {
  const q = item.kind === 'agent' ? `Run the ${item.name} agent: ` : `Using ${item.name} (${item.slug}): `;
  const pick = model ?? (item.kind === 'model' ? item.name : undefined);
  return { q, ...(pick && COMPOSER_MODELS.some((m) => m.id === pick) ? { model: pick } : {}) };
}
