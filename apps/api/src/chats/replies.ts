import type { Attachment, Block, Knowledge, ModelChoice, Persona, Route } from '@donovan/contracts';
import { randomBytes } from 'node:crypto';

// Canned answers: Donovan doesn't call a model yet. Each reply says honestly what was "routed", and is streamed as if
// it were being written (see stream.ts).

export interface Reply {
  routing: Route[];
  blocks: Block[];
}

const DEFAULT_MODEL = 'claude-sonnet-4.5';

/** Another way to say it, for Regenerate: a different opening, and lists in another order. */
export function pickReply(text: string, model: ModelChoice, variant = 0): Reply {
  const reply = baseReply(text, model);
  if (variant === 0) return reply;
  const openers = ['Here is another take. ', 'Looking at it again: ', 'A different angle: '];
  let opened = false;
  return {
    ...reply,
    blocks: reply.blocks.map((b) => {
      if (b.type === 'text' && !opened) {
        opened = true;
        return { ...b, text: openers[(variant - 1) % openers.length]! + b.text };
      }
      if (b.type === 'list')
        return {
          ...b,
          items: [...b.items.slice(variant % b.items.length), ...b.items.slice(0, variant % b.items.length)],
        };
      return b;
    }),
  };
}

const PERSONA_LEAD: Record<Exclude<Persona, 'balanced'>, string> = {
  'red-cell': 'Red Cell: arguing against the obvious reading.',
  historian: 'Historian: setting this against what came before.',
  collection: 'Collection: gathering what is known before judging it.',
};

const PERSONA_CLOSE: Partial<Record<Persona, string>> = {
  'red-cell':
    'Strongest objection: everything above rests on what was retrieved for this one question. Look for what would contradict it before acting.',
};

/**
 * An answer shaped by the chat's settings. Training only: no tools, servers or datasets, and it says so. Live: a web
 * search runs alongside the workspace's tools. A persona other than Balanced says how it's approaching the question.
 */
export function shapeReply(reply: Reply, persona: Persona, knowledge: Knowledge): Reply {
  let { routing, blocks } = reply;
  if (knowledge === 'training') {
    routing = routing.filter((r) => r.kind === 'model' || r.kind === 'skill');
    blocks = [
      {
        type: 'text',
        text: 'Training only: answered from what the model knows, without tools or workspace documents.',
      },
      ...blocks.filter((b) => b.type !== 'tool' && b.type !== 'artifact' && b.type !== 'workflow'),
    ];
  } else if (knowledge === 'live') {
    routing = [...routing, { kind: 'server', name: 'Web search' }];
    blocks = [
      {
        type: 'tool',
        id: 'web',
        name: 'web_search',
        server: 'Web search',
        summary: 'Live web · 6 results',
        sensitivity: 'Public',
        status: 'done',
        write: false,
        durationMs: 900,
        args: { query: 'latest on this question' },
        result: '6 results from the last 7 days',
      },
      ...blocks,
    ];
  }
  if (persona !== 'balanced') {
    const close = PERSONA_CLOSE[persona];
    blocks = [
      { type: 'text', text: PERSONA_LEAD[persona] },
      ...blocks,
      ...(close ? [{ type: 'text' as const, text: close }] : []),
    ];
  }
  return { routing, blocks };
}

/** An answer to a message with files: it says which it read first, so the person can tell they arrived. */
export function withFiles(reply: Reply, files: Attachment[]): Reply {
  if (files.length === 0) return reply;
  const names = files.map((f) => f.name);
  const list = names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} and ${names.at(-1)!}`;
  const tokens = files.reduce((n, f) => n + f.tokens, 0);
  return {
    ...reply,
    blocks: [
      { type: 'text', text: `I read ${list} (about ${tokens.toLocaleString('en-US')} tokens).` },
      ...reply.blocks,
    ],
  };
}

function baseReply(text: string, model: ModelChoice): Reply {
  const chosen: Route = { kind: 'model', name: model === 'auto' ? DEFAULT_MODEL : model };

  // Write tools change something outside Donovan, so they wait for approval (unless the chat allows them).
  if (/\b(post|announce|notify)\b/i.test(text)) {
    return writeReply(chosen, {
      name: 'post_message',
      server: 'Slack · #risk-ops',
      summary: 'Post the update to #risk-ops (write)',
      args: { channel: '#risk-ops', text: excerpt(text) },
      lead: "Here's the update for #risk-ops.",
    });
  }
  if (/\b(file|create|open|raise)\s+(an?\s+)?(issue|ticket|bug)\b/i.test(text)) {
    return writeReply(chosen, {
      name: 'create_issue',
      server: 'Linear · RISK',
      summary: 'Create an issue in RISK (write)',
      args: { team: 'RISK', title: excerpt(text) },
      lead: "Here's the issue, ready to file in RISK.",
    });
  }

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

interface WriteCall {
  name: string;
  server: string;
  summary: string;
  args: Record<string, string>;
  lead: string;
}

/** An answer that needs a write tool: the tool waits for approval, with an id of its own so each call is decided once. */
function writeReply(chosen: Route, call: WriteCall): Reply {
  return {
    routing: [chosen, { kind: 'server', name: call.server.split(' · ')[0]! }],
    blocks: [
      { type: 'text', text: call.lead },
      {
        type: 'tool',
        id: `w-${randomBytes(4).toString('hex')}`,
        name: call.name,
        server: call.server,
        summary: call.summary,
        sensitivity: 'Internal',
        status: 'pending',
        write: true,
        durationMs: null,
        args: call.args,
        result: null,
      },
    ],
  };
}

/** The first line of a message, short enough for a tool argument. */
function excerpt(text: string): string {
  const line = text.trim().split('\n')[0]!;
  return line.length > 80 ? `${line.slice(0, 77).trimEnd()}…` : line;
}

/**
 * Runs the answer's waiting write tools that may run without asking, and says so: the ones the chat allows ("Always in
 * this chat"), or all of them when the workspace doesn't require approval ("all"). Any other write tool keeps waiting.
 */
export function allowListed(reply: Reply, allowed: readonly string[] | 'all'): Reply {
  const ran: string[] = [];
  const blocks = reply.blocks.map((b): Block => {
    if (b.type !== 'tool' || b.status !== 'pending' || (allowed !== 'all' && !allowed.includes(b.name))) return b;
    ran.push(b.name);
    return { ...b, status: 'done', durationMs: 1100, result: `Done · ${b.summary.replace(/\s*\(write\)$/, '')}` };
  });
  if (ran.length === 0) return reply;
  const names = [...new Set(ran)].join(', ');
  const why =
    allowed === 'all'
      ? "the workspace doesn't require approval for write tools."
      : 'you allowed it in this chat. Revoke that in the session panel.';
  return { ...reply, blocks: [...blocks, { type: 'text', text: `Ran ${names} without asking: ${why}` }] };
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
