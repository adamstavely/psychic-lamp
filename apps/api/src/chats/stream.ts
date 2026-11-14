import type { AssistantMessage, Block, StreamEvent } from '@donovan/contracts';

const wait = (ms: number) => (ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve());

/**
 * Replays a finished answer the way a model would write it: tool calls start running and then finish, and text arrives
 * a few words at a time. `speed` scales every pause (0 for tests); `signal` stops it when the reader leaves.
 */
export async function* streamAnswer(
  answer: AssistantMessage,
  speed: number,
  signal: AbortSignal,
): AsyncGenerator<StreamEvent> {
  yield { type: 'start', id: answer.id, routing: answer.routing, at: answer.at };
  await wait(350 * speed);

  for (const [index, block] of answer.blocks.entries()) {
    if (signal.aborted) return;
    if (block.type === 'tool' && block.status === 'done') {
      yield { type: 'block', index, block: { ...block, status: 'running', durationMs: null, result: null } };
      await wait(Math.min(block.durationMs ?? 900, 1400) * speed);
      yield { type: 'block', index, block };
    } else if (block.type === 'text') {
      yield { type: 'block', index, block: { ...block, text: '' } satisfies Block };
      for (const chunk of block.text.match(/\S+\s*/g) ?? []) {
        if (signal.aborted) return;
        await wait(28 * speed);
        yield { type: 'delta', index, text: chunk };
      }
    } else {
      await wait(180 * speed);
      yield { type: 'block', index, block };
    }
  }
  yield { type: 'done', message: answer };
}

/** One server-sent event. */
export function sse(event: StreamEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}
