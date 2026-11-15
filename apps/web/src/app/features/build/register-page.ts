import { HttpClient, httpResource } from '@angular/common/http';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  type ElementRef,
  inject,
  Injector,
  input,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { Switch } from '@adamstavely/trenchcoat/angular/switch';
import type {
  NewRegistryItem,
  PolicyList,
  RegistrableKind,
  RegistryAccess,
  RegistryItem,
  RegistryKind,
  RegistrySummary,
  Sensitivity,
} from '@donovan/contracts';
import { firstValueFrom } from 'rxjs';
import { Session } from '../../core/session';
import { SENSITIVITIES } from '../../core/sensitivities';
import { BUILD_AREAS, buildAreaFor } from '../../shell/areas';
import { IconDirective } from '../../core/icon.directive';

interface KindOption {
  id: RegistrableKind;
  label: string;
  description: string;
  /** The middle step's name, which depends on the kind. */
  step: string;
}

const KINDS: KindOption[] = [
  { id: 'server', label: 'MCP server', description: 'Tools and data an agent can call.', step: 'Connection' },
  { id: 'skill', label: 'Skill', description: 'Know-how an agent loads for a matching task.', step: 'Knowledge' },
  {
    id: 'agent',
    label: 'Agent',
    description: 'A model plus servers, skills and an autonomy level.',
    step: 'Composition',
  },
  {
    id: 'model',
    label: 'Model',
    description: 'A foundation or task model, with a card and evals.',
    step: 'Model card',
  },
  { id: 'dataset', label: 'Dataset', description: 'Versioned data with splits and a schema.', step: 'Dataset card' },
  { id: 'space', label: 'Space', description: 'An interactive demo in front of a model.', step: 'Space' },
  { id: 'collection', label: 'Collection', description: 'A bundle of any of the above.', step: 'Members' },
];

const ACCESS: { key: keyof RegistryAccess; label: string; description: string }[] = [
  { key: 'readOnly', label: 'Read-only by default', description: 'Write tools stay off until an admin turns them on.' },
  { key: 'approval', label: 'Approval for writes', description: 'Each write call is approved in chat before it runs.' },
  {
    key: 'internalOnly',
    label: 'Internal only',
    description: 'Hidden from external collaborators and the public registry.',
  },
  { key: 'audit', label: 'Audit every call', description: 'Calls are logged with chat and user for 90 days.' },
];

const RANK = (s: Sensitivity) => SENSITIVITIES.findIndex((t) => t.id === s);

/**
 * Register something in the registry, in five steps: what it is, its name, what its kind needs, how it may be used, and
 * a last look. It's saved as waiting for review, in the person's Mine; nothing is published until it's approved.
 */
@Component({
  selector: 'dn-register-page',
  imports: [FormsModule, RouterLink, Button, IconDirective, Switch],
  templateUrl: './register-page.html',
  styleUrls: ['./detail.css', './register-page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class RegisterPage {
  /** From the URL: the kind to start with (the Register button passes the area's). */
  readonly kind = input<string>();
  readonly #http = inject(HttpClient);
  readonly #session = inject(Session);
  readonly #injector = inject(Injector);

  protected readonly kinds = KINDS;
  /** Back to the area Register was opened from (its kind's), else Build's first area. */
  protected readonly backLink = computed(() => {
    const a = BUILD_AREAS.find((x) => x.kind === this.kind()) ?? BUILD_AREAS[0]!;
    return { path: a.path, label: a.label };
  });
  protected readonly tiers = SENSITIVITIES;
  protected readonly accessOptions = ACCESS;
  protected readonly picked = linkedSignal<RegistrableKind>(
    () => (KINDS.find((k) => k.id === this.kind())?.id ?? 'server') as RegistrableKind,
  );
  protected readonly pickedKind = computed(() => KINDS.find((k) => k.id === this.picked())!);
  protected readonly steps = computed(() => ['Type', 'Identity', this.pickedKind().step, 'Governance', 'Review']);
  protected readonly step = signal(0);
  /** The furthest step reached, so earlier ones can be gone back to. */
  protected readonly reached = signal(0);

  /** What's in the registry: teams to register for, and what an agent or collection can be made of. */
  readonly #registry = httpResource<RegistrySummary[]>(() => '/api/registry');
  protected readonly all = computed(() => (this.#registry.hasValue() ? this.#registry.value() : []));
  protected readonly teams = computed(() =>
    [...new Set(this.all().flatMap((i) => (i.owner.team ? [i.owner.team] : [])))].sort(),
  );
  protected readonly servers = computed(() =>
    this.all().filter((i) => i.kind === 'server' && i.status === 'published'),
  );
  protected readonly skills = computed(() => this.all().filter((i) => i.kind === 'skill' && i.status === 'published'));
  protected readonly models = computed(() => this.all().filter((i) => i.kind === 'model' && i.status === 'published'));
  protected readonly memberOptions = computed(() =>
    this.all().filter(
      (i) => i.status === 'published' && ['server', 'skill', 'model', 'agent', 'dataset', 'space'].includes(i.kind),
    ),
  );

  // The form: one object, since each step reads and writes its own part of it.
  protected readonly f = {
    name: '',
    summary: '',
    team: '',
    transport: 'HTTP' as 'HTTP' | 'STDIO' | 'SSE',
    auth: 'OAuth 2.1' as 'OAuth 2.1' | 'API key' | 'Service account' | 'None',
    endpoint: '',
    source: '',
    triggers: '',
    skillMd: '',
    model: 'claude-sonnet-4.5',
    autonomy: 'Approval on writes' as 'Read-only' | 'Approval on writes' | 'Autonomous',
    task: 'Classification' as 'Foundation' | 'Classification' | 'Forecasting' | 'Documents' | 'Vision',
    framework: 'PyTorch' as 'PyTorch' | 'Transformers' | 'scikit-learn' | 'ONNX',
    base: '',
    format: 'Parquet' as 'Parquet' | 'JSONL' | 'CSV' | 'PDF + JSON',
    rows: '',
    splits: '',
    spaceModel: '',
    inputLabel: '',
    placeholder: '',
    sensitivity: 'Internal' as Sensitivity,
  };
  protected readonly access: RegistryAccess = { readOnly: true, approval: true, internalOnly: false, audit: true };
  /** While the workspace's read-only policy is on, everything starts read-only, and the switch says so. */
  readonly #policies = httpResource<PolicyList>(() => '/api/governance/policies');
  protected readonly readOnlyForced = computed(
    () =>
      this.#policies.hasValue() &&
      !!this.#policies.value().policies.find((p) => p.id === 'read-only-default' && p.enabled),
  );
  /** Picked servers, skills or members, by "kind:name". */
  protected readonly picks = signal<Set<string>>(new Set());

  protected togglePick(item: { kind: RegistryKind; name: string }): void {
    const key = `${item.kind}:${item.name}`;
    this.picks.update((set) => {
      const next = new Set(set);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  protected isPicked(item: { kind: RegistryKind; name: string }): boolean {
    return this.picks().has(`${item.kind}:${item.name}`);
  }
  protected readonly pickedItems = computed(() =>
    [...this.picks()].map((key) => {
      const [kind, ...name] = key.split(':');
      return { kind: kind as RegistryKind, name: name.join(':') };
    }),
  );
  /** A collection is as sensitive as its most sensitive member. */
  protected readonly ceiling = computed<Sensitivity>(() =>
    this.pickedItems().reduce<Sensitivity>((c, p) => {
      const s = this.all().find((i) => i.kind === p.kind && i.name === p.name)?.sensitivity ?? 'Public';
      return RANK(s) > RANK(c) ? s : c;
    }, 'Public'),
  );

  protected readonly slug = signal('');
  protected updateSlug(): void {
    const part = (t: string) =>
      t
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    const who = this.f.team || (this.#session.me.hasValue() ? this.#session.me.value().name : '') || 'me';
    this.slug.set(`${part(who)}/${part(this.f.name) || 'name'}`);
  }

  protected readonly error = signal('');

  /** What's missing before the person can leave the step, in a sentence; empty when nothing is. */
  protected missing(): string {
    const f = this.f;
    switch (this.step()) {
      case 1:
        return !f.name.trim() ? 'Name it.' : !f.summary.trim() ? 'Say what it does.' : '';
      case 2:
        switch (this.picked()) {
          case 'server':
            return f.endpoint.trim() ? '' : 'Give its endpoint.';
          case 'skill':
            return f.skillMd.trim() ? '' : 'Paste its SKILL.md.';
          case 'agent':
            return this.picks().size ? '' : 'Pick at least one server or skill.';
          case 'space':
            return !f.spaceModel ? 'Pick its model.' : !f.inputLabel.trim() ? 'Say what people give it.' : '';
          case 'collection':
            return this.picks().size >= 2 ? '' : 'Pick at least two members.';
          default:
            return '';
        }
      default:
        return '';
    }
  }

  protected pickKind(kind: RegistrableKind): void {
    if (kind !== this.picked()) this.picks.set(new Set());
    this.picked.set(kind);
  }

  private readonly heading = viewChild<ElementRef<HTMLElement>>('stepHeading');

  protected goTo(step: number): void {
    this.error.set('');
    this.step.set(step);
    this.reached.update((r) => Math.max(r, step));
    if (step === 1) this.updateSlug();
    // Focus follows the step, so a screen reader starts at its heading.
    afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.#injector });
  }

  protected next(): void {
    const missing = this.missing();
    if (missing) {
      this.error.set(missing);
      return;
    }
    this.goTo(this.step() + 1);
  }

  // Submitting.
  protected readonly submitting = signal(false);
  protected readonly made = signal<RegistryItem | null>(null);
  protected readonly madeLink = computed(() => {
    const m = this.made();
    return m ? [buildAreaFor(m.kind).path, m.id] : null;
  });
  protected readonly mineLink = computed(() => buildAreaFor(this.picked()).path);

  /** The tier it's submitted at: what was picked, or a collection's ceiling when that's higher. */
  protected tierFor(): Sensitivity {
    return this.picked() === 'collection' && RANK(this.ceiling()) > RANK(this.f.sensitivity)
      ? this.ceiling()
      : this.f.sensitivity;
  }

  protected review(): { label: string; value: string }[] {
    const f = this.f;
    const rows = [
      { label: 'Type', value: this.pickedKind().label },
      { label: 'Name', value: f.name },
      { label: 'Slug', value: this.slug() },
      { label: 'Owner', value: f.team || 'You' },
      { label: 'Summary', value: f.summary },
    ];
    const specific: Record<RegistrableKind, { label: string; value: string }[]> = {
      server: [
        { label: 'Transport', value: f.transport },
        { label: 'Authentication', value: f.auth },
        { label: 'Endpoint', value: f.endpoint },
      ],
      skill: [{ label: 'Triggers', value: f.triggers || 'None' }],
      agent: [
        { label: 'Model', value: f.model },
        { label: 'Autonomy', value: f.autonomy },
        {
          label: 'Uses',
          value: this.pickedItems()
            .map((p) => p.name)
            .join(', '),
        },
      ],
      model: [
        { label: 'Task', value: f.task },
        { label: 'Framework', value: f.framework },
      ],
      dataset: [
        { label: 'Format', value: f.format },
        { label: 'Rows', value: f.rows || '—' },
      ],
      space: [
        { label: 'Model', value: f.spaceModel },
        { label: 'Input', value: f.inputLabel },
      ],
      collection: [
        {
          label: 'Members',
          value: this.pickedItems()
            .map((p) => p.name)
            .join(', '),
        },
      ],
    };
    const access = ACCESS.filter((a) => this.access[a.key])
      .map((a) => a.label.toLowerCase())
      .join(', ');
    return [
      ...rows,
      ...specific[this.picked()],
      { label: 'Tier', value: this.tierFor() },
      { label: 'Access', value: access || 'No restrictions' },
    ];
  }

  /** Why a reviewer will look harder, if they will. */
  protected risk(): string {
    const t = this.tierFor();
    const autonomous = this.picked() === 'agent' && this.f.autonomy === 'Autonomous';
    if (t === 'Restricted' || autonomous || !this.access.approval)
      return 'Reviewers will look closely: it is Restricted, acts on its own, or runs writes without approval.';
    if (t === 'Confidential') return 'Confidential: reviewers check who can see it and what it can change.';
    return '';
  }

  protected async submit(): Promise<void> {
    if (this.submitting()) return;
    this.submitting.set(true);
    this.error.set('');
    try {
      const made = await firstValueFrom(this.#http.post<RegistryItem>('/api/registry', this.body()));
      this.made.set(made);
    } catch (err) {
      this.error.set((err as { error?: { message?: string } }).error?.message ?? "It wasn't submitted. Try again.");
    } finally {
      this.submitting.set(false);
    }
  }

  private body(): NewRegistryItem {
    const f = this.f;
    const shared = {
      name: f.name.trim(),
      summary: f.summary.trim(),
      team: f.team || null,
      sensitivity: this.tierFor(),
      access: { ...this.access },
    };
    const picks = this.pickedItems();
    switch (this.picked()) {
      case 'server':
        return {
          ...shared,
          kind: 'server',
          transport: f.transport,
          auth: f.auth,
          endpoint: f.endpoint.trim(),
          ...(f.source.trim() ? { source: f.source.trim() } : {}),
        };
      case 'skill':
        return { ...shared, kind: 'skill', triggers: f.triggers.trim(), skillMd: f.skillMd };
      case 'agent':
        return {
          ...shared,
          kind: 'agent',
          model: f.model,
          autonomy: f.autonomy,
          servers: picks.filter((p) => p.kind === 'server').map((p) => p.name),
          skills: picks.filter((p) => p.kind === 'skill').map((p) => p.name),
        };
      case 'model':
        return { ...shared, kind: 'model', task: f.task, framework: f.framework, base: f.base.trim() };
      case 'dataset':
        return { ...shared, kind: 'dataset', format: f.format, rows: f.rows.trim(), splits: f.splits.trim() };
      case 'space':
        return {
          ...shared,
          kind: 'space',
          model: f.spaceModel,
          inputLabel: f.inputLabel.trim(),
          placeholder: f.placeholder.trim(),
        };
      case 'collection':
        return { ...shared, kind: 'collection', members: picks };
    }
  }
}
