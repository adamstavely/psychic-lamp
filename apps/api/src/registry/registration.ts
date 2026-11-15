import type { NewRegistryItem, RegistryItem } from '@donovan/contracts';

/** A name as a URL part: "Release notes v2" is release-notes-v2. */
export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'item'
  );
}

/**
 * A registered item's details, from what the wizard asked for. Figures the registry keeps (installs, calls, runs, uses)
 * start at nothing; what only exists once it's running (a server's tools, a model's evals) starts empty.
 */
export function detailsFor(body: NewRegistryItem): RegistryItem['details'] {
  switch (body.kind) {
    case 'server':
      return {
        verified: false,
        official: false,
        transport: body.transport,
        auth: body.auth,
        installs: '0',
        calls: '0',
        source: body.source || body.endpoint,
        tools: [],
      };
    case 'skill':
      return { score: null, uses: '0', principles: principlesOf(body.skillMd), tests: [] };
    case 'agent':
      return {
        autonomy: body.autonomy,
        model: body.model,
        servers: body.servers,
        skills: body.skills,
        runs: '0',
        success: '—',
      };
    case 'model':
      return {
        task: body.task,
        base: body.base || body.framework,
        context: '—',
        calls: '0',
        verified: false,
        metrics: [],
        files: [],
        evals: [],
      };
    case 'dataset':
      return {
        rows: body.rows || '—',
        size: '—',
        format: body.format,
        splits: body.splits || '—',
        usedBy: [],
        pulls: '0',
        updated: 'just now',
        schema: [],
      };
    case 'space':
      return {
        model: body.model,
        visits: '0',
        inputLabel: body.inputLabel,
        placeholder: body.placeholder,
        outputs: [],
      };
    case 'collection':
      return { members: body.members };
  }
}

/** A SKILL.md's principles: each "## " heading and the text under it, up to the next heading. */
export function principlesOf(skillMd: string): { title: string; text: string }[] {
  const body = skillMd.replace(/^---[\s\S]*?\n---\s*/, '');
  return [...body.matchAll(/^##\s+(.+)\n([\s\S]*?)(?=^##\s|(?![\s\S]))/gm)]
    .map((m) => ({ title: m[1]!.trim().slice(0, 200), text: m[2]!.trim().slice(0, 2000) }))
    .filter((p) => p.title)
    .slice(0, 50);
}
