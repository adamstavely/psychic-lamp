import type { Block, ModelChoice, Route } from '@donovan/contracts';

// Canned answers: Donovan doesn't call a model yet. Each reply says honestly what was "routed", and is streamed as if
// it were being written (see stream.ts).

export interface Reply {
  routing: Route[];
  blocks: Block[];
}

const DEFAULT_MODEL = 'claude-sonnet-4.5';

export function pickReply(text: string, model: ModelChoice): Reply {
  const chosen: Route = { kind: 'model', name: model === 'auto' ? DEFAULT_MODEL : model };

  if (/\b(prep|prepare|meeting|go\/no-go)\b/i.test(text)) {
    return {
      routing: [chosen, { kind: 'server', name: 'Calendar' }, { kind: 'server', name: 'Mail' }],
      blocks: [
        tool(
          'cal',
          'list_events',
          'Calendar',
          "Today's meetings · 3 events",
          'Internal',
          { day: 'today' },
          '3 events, the go/no-go at 2:00 PM',
        ),
        tool(
          'mail',
          'search_mail',
          'Mail',
          'Threads about the go/no-go · 4 messages',
          'Confidential',
          { query: 'Fraud Sentinel go/no-go' },
          '4 messages from Mara Lindqvist and Legal',
        ),
        { type: 'text', text: 'For the 2:00 PM Fraud Sentinel go/no-go, bring three things:' },
        {
          type: 'list',
          items: [
            'The drift numbers: PSI on device_age crossed 0.2 overnight; show the trend since Oct 9.',
            'The final rollout note, approved and posted to #risk-ops, so the decision has a record.',
            'The rollback trigger: false positives over 0.8% or p99 over 41 ms for 15 minutes.',
          ],
        },
        {
          type: 'text',
          text: 'Mara asked to decide in one pass, so lead with the recommendation and keep the appendix for questions.',
        },
      ],
    };
  }

  if (/\b(draft|reply|write)\b/i.test(text)) {
    return {
      routing: [chosen, { kind: 'skill', name: 'Reply in your voice v1.1' }],
      blocks: [
        {
          type: 'skill',
          name: 'Reply in your voice',
          version: 'v1.1',
          note: 'Matched your usual length and sign-off from your last 20 sent messages.',
        },
        { type: 'text', text: "Here's a draft:" },
        {
          type: 'code',
          language: 'text',
          text: "Thanks — I'll bring the drift numbers and the final rollout note to the 2:00 PM. Short version: we're inside the FP guardrail, and the only open item is the 3 ms latency overrun in the batch window.",
        },
        { type: 'text', text: 'Want me to send it, or change anything first?' },
      ],
    };
  }

  return {
    routing: [chosen],
    blocks: [
      {
        type: 'text',
        text: 'On it. I routed this to the default model with no tools; tell me if you want a skill or server attached.',
      },
    ],
  };
}

/** What Donovan says after a write tool is approved or denied. */
export function decisionReply(toolName: string, server: string, approved: boolean): Reply {
  return {
    routing: [{ kind: 'server', name: server.split(' · ')[0]! }],
    blocks: [
      {
        type: 'text',
        text: approved
          ? `Done: ${toolName} ran on ${server}. It's logged against this chat.`
          : `I didn't run ${toolName}. Tell me what to change and I'll redraft it.`,
      },
    ],
  };
}

function tool(
  id: string,
  name: string,
  server: string,
  summary: string,
  sensitivity: 'Internal' | 'Confidential',
  args: Record<string, string>,
  result: string,
): Block {
  return {
    type: 'tool',
    id,
    name,
    server,
    summary,
    sensitivity,
    status: 'done',
    write: false,
    durationMs: 900,
    args,
    result,
  };
}
