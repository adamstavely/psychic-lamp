import type { RegistryDetails } from '@donovan/contracts';

type ServerTool = RegistryDetails<'server'>['tools'][number];

/**
 * A sandbox run of a server's tool: a mock of what the real tool returns, shaped by the arguments given, so its
 * response can be seen before it's used in a chat. Nothing is called and nothing changes, write tools included.
 */
export function mockToolResult(tool: ServerTool, args: Record<string, string>): string {
  const a = (name: string, fallback: string) => args[name]?.trim() || fallback;
  const known: Record<string, () => unknown> = {
    read_file: () => ({
      path: a('path', 'fraud/runbook.md'),
      content: '# Rollout runbook\n\n1. Decide the cohort first…',
    }),
    list_dir: () => ['batch_2026-10-11.parquet', 'batch_2026-10-04.parquet', 'runbook.md'],
    write_file: () => ({ ok: true, path: a('path', 'notes/draft.md'), bytes: 1840 }),
    post_message: () => ({ ok: true, channel: a('channel', '#risk-ops'), ts: '1760784120.001' }),
    read_messages: () => [
      { user: 'maya', text: 'FP rate holding at 0.58%', ts: '10:41' },
      { user: 'donovan', text: 'Rollout note posted', ts: '10:42' },
    ],
    list_channels: () => ['#risk-ops', '#releases', '#support-triage'],
    query: () => [
      { intent: 'billing.duplicate_charge', count: 4821 },
      { intent: 'account.login', count: 3902 },
    ],
    describe: () => [
      { column: 'conv_id', type: 'text' },
      { column: 'intent', type: 'text[]' },
    ],
    get_pr: () => ({
      number: Number(a('number', '482')) || 482,
      title: 'Add approval tiers',
      checks: 'passing',
      files: 12,
    }),
    comment: () => ({
      ok: true,
      url: `https://github.com/${a('repo', 'acme/app')}/pull/${a('number', '482')}#issuecomment-1`,
    }),
    get_sku: () => ({ sku: a('sku', '88213-BLK'), name: 'Trail Jacket · Black', price: 129 }),
    upsert_sku: () => ({ ok: true, sku: a('sku', '88213-BLK'), version: 4 }),
    soql: () => [{ Id: '001…', Name: 'Northwind', Stage: 'Negotiation' }],
    update_record: () => ({ ok: true, id: a('id', '001…') }),
  };
  const result = known[tool.name]?.() ?? { ok: true, tool: tool.name, args };
  return JSON.stringify(result, null, 2);
}

/** The required parameters left empty, by name. */
export function missingArgs(tool: ServerTool, args: Record<string, string>): string[] {
  return tool.params.filter((p) => p.required && !args[p.name]?.trim()).map((p) => p.name);
}
