import type { Chat, Message } from '@donovan/contracts';

/** The context-window limit Donovan assumes for its models. */
export const CONTEXT_LIMIT = 200_000;

/** Roughly four characters a token, as tokenizers average for English. */
const tokens = (chars: number) => Math.round(chars / 4);

/**
 * What the latest answer was given to read, estimated from the thread: the system prompt, the project's instructions,
 * the turns before it, documents its tools retrieved and the tool results.
 */
export function contextFor(chat: Pick<Chat, 'calibrated' | 'project'>, messages: Message[]): Chat['context'] {
  const lastAnswer = messages.findLastIndex((m) => m.role === 'assistant');
  const before = lastAnswer < 0 ? messages : messages.slice(0, lastAnswer);
  const answer = lastAnswer < 0 ? null : messages[lastAnswer];
  const tools = answer?.role === 'assistant' ? answer.blocks.filter((b) => b.type === 'tool') : [];
  const retrieved = tools.filter((t) => /search|read|query/.test(t.name));

  const parts = [
    {
      label: chat.calibrated ? 'System prompt · Calibrated analyst' : 'System prompt',
      tokens: chat.calibrated ? 312 : 240,
    },
    ...(chat.project ? [{ label: `Project instructions · ${chat.project}`, tokens: 140 }] : []),
    {
      label: `Prior exchanges · ${before.filter((m) => m.role === 'user').length}`,
      tokens: tokens(
        before.reduce((n, m) => n + (m.role === 'user' ? m.text.length : JSON.stringify(m.blocks).length), 0),
      ),
    },
    ...(retrieved.length
      ? [{ label: `Retrieved · ${retrieved.length} sources`, tokens: retrieved.length * 1100 }]
      : []),
    ...(tools.length
      ? [
          {
            label: `Tool results · ${tools.length}`,
            tokens: tools.length * 160 + tokens(tools.map((t) => t.result ?? '').join('').length),
          },
        ]
      : []),
  ];
  const model =
    answer?.role === 'assistant'
      ? (answer.routing.find((r) => r.kind === 'model')?.name ?? 'claude-sonnet-4.5')
      : 'claude-sonnet-4.5';
  return { model, limit: CONTEXT_LIMIT, parts };
}
