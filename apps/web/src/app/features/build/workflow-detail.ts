import { HttpClient, HttpErrorResponse, httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { SegmentedControl } from '@adamstavely/trenchcoat/angular/segmented-control';
import { Select } from '@adamstavely/trenchcoat/angular/select';
import { WorkflowCanvas } from '@adamstavely/trenchcoat/angular/workflow-canvas';
import type { SegmentOption, SegmentValueChange } from '@adamstavely/trenchcoat/segmented-control';
import type { SelectOption } from '@adamstavely/trenchcoat/select';
import { toast } from '@adamstavely/trenchcoat/toaster';
import {
  defaultWorkflowKinds,
  type WorkflowAddRequest,
  type WorkflowEdgesChange,
  type WorkflowKindInfo,
  type WorkflowNode as CanvasNode,
  type WorkflowNodesChange,
  type WorkflowSelectedChange,
  type WorkflowStatus,
} from '@adamstavely/trenchcoat/workflow-canvas';
import type {
  RegistryItem,
  Sensitivity,
  WorkflowBindings,
  WorkflowGraph,
  WorkflowNode,
  WorkflowStepKind,
} from '@donovan/contracts';
import { checkWorkflow } from '@donovan/contracts/defaults';
import { IconDirective } from '../../core/icon.directive';
import { icon, type IconName } from '../../core/icons';
import { Session } from '../../core/session';
import type { BuildArea } from '../../shell/areas';

type Workflow = Extract<RegistryItem, { kind: 'workflow' }>;
type Edge = [string, string];
type Failure = NonNullable<WorkflowNode['onFailure']>;
type RunState = 'idle' | 'running' | 'awaiting' | 'done';

/** Each step kind: its kind on the canvas, its icon, what it's bound to, and the bindings that aren't in the registry. */
const KINDS: Record<WorkflowStepKind, { canvas: string; icon: IconName; tip: string; bind: string; fixed?: string[] }> =
  {
    Trigger: {
      canvas: 'trigger',
      icon: 'zap',
      tip: 'Starts the run',
      bind: 'Trigger',
      fixed: [
        'Schedule · daily 07:00',
        'Schedule · Fridays 16:00',
        'Webhook',
        'Chat command',
        'New file in Filesystem',
      ],
    },
    Tool: { canvas: 'tool', icon: 'wrench', tip: 'Call a server tool', bind: 'Server tool' },
    Model: { canvas: 'llm', icon: 'model', tip: 'Score, extract or generate', bind: 'Model' },
    Skill: { canvas: 'skill', icon: 'skill', tip: 'Apply a skill', bind: 'Skill' },
    Approval: {
      canvas: 'approval',
      icon: 'lock',
      tip: 'Pause for a person',
      bind: 'Approver',
      fixed: ['Workflow owner', 'Chat owner', 'Internal · Support team', 'Confidential · Risk ML'],
    },
    Branch: {
      canvas: 'condition',
      icon: 'branch',
      tip: 'Route on a condition',
      bind: 'Condition',
      fixed: ['If confidence < 0.8', 'If amount > $10k', 'If the customer is new'],
    },
  };
const STEP_KINDS = Object.keys(KINDS) as WorkflowStepKind[];

/** The canvas's own kinds, named as Donovan names them; a skill borrows the model's icon. */
const CANVAS_KINDS: Record<string, Partial<WorkflowKindInfo>> = {
  llm: { label: 'Model' },
  condition: { label: 'Branch' },
  skill: { label: 'Skill', icon: defaultWorkflowKinds['llm']?.icon },
};

const FAILURES: { value: Failure; label: string }[] = [
  { value: 'stop', label: 'Stop' },
  { value: 'retry', label: 'Retry 3×' },
  { value: 'skip', label: 'Skip' },
];
const TIERS: Sensitivity[] = ['Public', 'Internal', 'Confidential', 'Restricted'];
const STEP_MS = 1100;
const LIMIT = 4000;

const clamp = (n: number) => Math.round(Math.min(LIMIT, Math.max(0, n)));
const time = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** The steps in the order they can run: each stage is the steps whose every step before them is in an earlier one. */
function stagesOf(nodes: readonly WorkflowNode[], edges: readonly Edge[]): WorkflowNode[][] {
  const ids = new Set(nodes.map((n) => n.id));
  const live = edges.filter(([a, b]) => ids.has(a) && ids.has(b) && a !== b);
  const placed = new Set<string>();
  const out: WorkflowNode[][] = [];
  while (placed.size < nodes.length) {
    const ready = nodes.filter((n) => !placed.has(n.id) && live.every(([a, b]) => b !== n.id || placed.has(a)));
    // A loop: run what's left together rather than never.
    const stage = ready.length ? ready : nodes.filter((n) => !placed.has(n.id));
    stage.sort((a, b) => a.y - b.y);
    for (const n of stage) placed.add(n.id);
    out.push(stage);
  }
  return out;
}

/**
 * A workflow on its canvas. View runs it (simulated: stage by stage, pausing at an approval until someone approves),
 * with a run log. Edit, for its owner (or anyone, for a team's): add steps from the palette, drag and connect them on
 * the canvas, set each one's name, binding and what happens when it fails, and save the graph as the next version,
 * which goes to review. The checks the API applies show as you edit.
 */
@Component({
  selector: 'dn-workflow-detail',
  imports: [RouterLink, Button, SegmentedControl, Select, WorkflowCanvas, IconDirective],
  templateUrl: './workflow-detail.html',
  styleUrl: './workflow-detail.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkflowDetail {
  readonly item = input.required<Workflow>();
  readonly area = input.required<BuildArea>();
  /** From the address: ?mode=edit. */
  readonly edit = input(false);
  /** Saved as its next version: the page reloads it. */
  readonly saved = output<void>();

  readonly #http = inject(HttpClient);
  readonly #router = inject(Router);
  readonly #me = inject(Session).me;
  private readonly palette = viewChild<ElementRef<HTMLElement>>('palette');

  protected readonly canvasKinds = CANVAS_KINDS;
  protected readonly kinds = STEP_KINDS.map((k) => ({
    kind: k,
    ...KINDS[k],
    add: `Add ${/^[AEIOU]/.test(k) ? 'an' : 'a'} ${k.toLowerCase()} step: ${KINDS[k].tip.toLowerCase()}`,
  }));
  protected readonly modes: SegmentOption[] = [
    { value: 'view', label: 'View', icon: icon('play', 14) },
    { value: 'edit', label: 'Edit', icon: icon('pencil', 14) },
  ];
  protected readonly failures: SegmentOption[] = FAILURES;
  protected readonly tiers: SelectOption[] = TIERS.map((t) => ({ value: t, label: t }));

  /** Someone's own workflow is theirs to edit; a team's is anyone's (it goes to review either way). */
  protected readonly canEdit = computed(() => {
    const owner = this.item().owner.personId;
    return owner === null || (this.#me.hasValue() && this.#me.value().id === owner);
  });
  protected readonly editing = computed(() => this.edit() && this.canEdit());

  // The graph being edited: a copy of the saved one, until it's saved or discarded.
  protected readonly name = linkedSignal(() => this.item().name);
  protected readonly sensitivity = linkedSignal<Sensitivity>(() => this.item().sensitivity);
  protected readonly nodes = linkedSignal<WorkflowNode[]>(() => this.item().details.nodes.map((n) => ({ ...n })));
  protected readonly edges = linkedSignal<Edge[]>(() => this.item().details.edges.map(([a, b]) => [a, b] as Edge));
  protected readonly selected = signal<string | null>(null);
  protected readonly saving = signal(false);

  protected readonly dirty = computed(() => {
    const w = this.item();
    return (
      this.name() !== w.name ||
      this.sensitivity() !== w.sensitivity ||
      JSON.stringify(this.nodes()) !== JSON.stringify(w.details.nodes) ||
      JSON.stringify(this.edges()) !== JSON.stringify(w.details.edges)
    );
  });

  /** What the canvas shows: the copy being edited, or the saved graph coloured by the run. */
  protected readonly shown = computed(() =>
    this.editing()
      ? { nodes: this.nodes(), edges: this.edges() }
      : { nodes: this.item().details.nodes, edges: this.item().details.edges as Edge[] },
  );

  protected readonly meta = computed(() => {
    const w = this.item();
    const n = this.shown().nodes.length;
    return `${w.version} · ${w.owner.name} · ${n} ${n === 1 ? 'step' : 'steps'} · ${w.details.schedule}`;
  });

  protected readonly checks = computed(() => checkWorkflow({ nodes: this.nodes(), edges: this.edges() }));
  protected readonly blocking = computed(() => this.checks().filter((c) => c.level === 'block').length);

  // The run, simulated: which stage it's on (-1 before it starts), and whether it's waiting for an approval.
  protected readonly stages = computed(() => stagesOf(this.item().details.nodes, this.item().details.edges as Edge[]));
  protected readonly step = signal(-1);
  protected readonly awaiting = signal(false);
  protected readonly log = signal<{ text: string; at: string; state: 'done' | 'running' | 'awaiting' }[]>([]);
  #timer: ReturnType<typeof setTimeout> | undefined;

  protected readonly runState = computed<RunState>(() =>
    this.step() < 0 ? 'idle' : this.step() >= this.stages().length ? 'done' : this.awaiting() ? 'awaiting' : 'running',
  );
  protected readonly runLabel = computed(
    () => ({ idle: 'Idle', running: 'Running', awaiting: 'Waiting for approval', done: 'Completed' })[this.runState()],
  );
  /** The approval the run is waiting on, if it is. */
  protected readonly waitingOn = computed(() =>
    this.awaiting() ? this.stages()[this.step()]?.find((n) => n.kind === 'Approval') : undefined,
  );

  protected readonly canvasNodes = computed<CanvasNode[]>(() => {
    const status = this.#statusOf();
    return this.shown().nodes.map((n) => ({
      id: n.id,
      kind: KINDS[n.kind].canvas,
      title: n.label,
      summary: this.waitingOn()?.id === n.id ? `Waiting for approval · ${n.sub}` : n.sub,
      x: n.x,
      y: n.y,
      status: this.editing() ? undefined : status(n.id),
    }));
  });
  protected readonly canvasEdges = computed(() => this.shown().edges.map(([from, to]) => ({ from, to })));

  // The inspector: the selected step, what it can be bound to, and where it leads.
  readonly #bindings = httpResource<WorkflowBindings>(() =>
    this.editing() ? '/api/registry/workflow-bindings' : undefined,
  );
  protected readonly sel = computed(() => this.nodes().find((n) => n.id === this.selected()) ?? null);
  protected readonly selKind = computed(() => {
    const n = this.sel();
    return n ? KINDS[n.kind] : null;
  });
  protected readonly bindOptions = computed<SelectOption[]>(() => {
    const n = this.sel();
    if (!n) return [];
    const from = KINDS[n.kind].fixed ?? this.#registryBindings(n.kind);
    return [...new Set([n.sub, ...from])].map((v) => ({ value: v, label: v }));
  });
  protected readonly nextSteps = computed(() => {
    const n = this.sel();
    if (!n) return [];
    const label = new Map(this.nodes().map((x) => [x.id, x.label]));
    return this.edges()
      .filter(([a]) => a === n.id)
      .map(([, to]) => ({ id: to, label: label.get(to) ?? to }));
  });
  protected readonly targets = computed<SelectOption[]>(() => {
    const n = this.sel();
    if (!n) return [];
    const taken = new Set(this.nextSteps().map((s) => s.id));
    return this.nodes()
      .filter((x) => x.id !== n.id && !taken.has(x.id))
      .map((x) => ({ value: x.id, label: x.label }));
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.#timer));
  }

  #registryBindings(kind: WorkflowStepKind): string[] {
    if (!this.#bindings.hasValue() || !(kind === 'Tool' || kind === 'Model' || kind === 'Skill')) return [];
    return this.#bindings.value()[kind];
  }

  #statusOf(): (id: string) => WorkflowStatus | undefined {
    const step = this.step();
    if (step < 0) return () => undefined;
    const stageOf = new Map(this.stages().flatMap((s, i) => s.map((n) => [n.id, i] as const)));
    return (id) => {
      const i = stageOf.get(id) ?? Infinity;
      return i < step ? 'done' : i === step ? 'running' : undefined;
    };
  }

  protected onMode(event: CustomEvent<SegmentValueChange>): void {
    event.preventDefault();
    this.reset();
    this.selected.set(null);
    void this.#router.navigate([], {
      queryParams: { mode: event.detail.value === 'edit' ? 'edit' : null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  // Running.

  protected run(): void {
    this.reset();
    this.step.set(0);
    this.#enter(0);
  }

  protected reset(): void {
    clearTimeout(this.#timer);
    this.step.set(-1);
    this.awaiting.set(false);
    this.log.set([]);
  }

  protected approve(): void {
    const n = this.waitingOn();
    this.awaiting.set(false);
    this.#finishLatest(`Approved: ${n?.label ?? 'the approval'}`);
    this.#next();
  }

  /** On a stage: log it, then wait for its approval, or move on after a beat. Past the last one, the run's done. */
  #enter(i: number): void {
    const stage = this.stages()[i];
    if (!stage) {
      toast.success('Workflow run completed', { description: `${this.item().name} · ${this.stages().length} stages` });
      return;
    }
    const approval = stage.some((n) => n.kind === 'Approval');
    const text = stage.map((n) => `${n.label} · ${n.sub}`).join('; ');
    this.log.update((l) => [{ text, at: time(), state: approval ? 'awaiting' : 'running' }, ...l]);
    if (approval) this.awaiting.set(true);
    else
      this.#timer = setTimeout(() => {
        this.#finishLatest();
        this.#next();
      }, STEP_MS);
  }

  #next(): void {
    const next = this.step() + 1;
    this.step.set(next);
    this.#enter(next);
  }

  #finishLatest(text?: string): void {
    this.log.update(([first, ...rest]) =>
      first ? [{ ...first, state: 'done', text: text ?? first.text, at: time() }, ...rest] : [],
    );
  }

  // Editing, from the canvas.

  protected onNodes(event: CustomEvent<WorkflowNodesChange>): void {
    const at = new Map(event.detail.nodes.map((n) => [n.id, n]));
    this.nodes.update((nodes) =>
      nodes.filter((n) => at.has(n.id)).map((n) => ({ ...n, x: clamp(at.get(n.id)!.x), y: clamp(at.get(n.id)!.y) })),
    );
    if (event.detail.reason === 'remove' && this.selected() === event.detail.id) this.selected.set(null);
  }

  protected onEdges(event: CustomEvent<WorkflowEdgesChange>): void {
    this.edges.set(event.detail.edges.map((e) => [e.from, e.to] as Edge));
  }

  protected onSelected(event: CustomEvent<WorkflowSelectedChange>): void {
    this.selected.set(event.detail.selected);
  }

  /** The canvas's Add step (or A on a step): the palette picks the kind. */
  protected onAddRequest(event: CustomEvent<WorkflowAddRequest>): void {
    this.selected.set(event.detail.after);
    this.palette()?.nativeElement.querySelector('button')?.focus();
  }

  // Editing, from the palette and the inspector.

  /** A new step of that kind, after the selected step (and joined to it), or at the end of the row. */
  protected add(kind: WorkflowStepKind): void {
    const after = this.sel();
    const nodes = this.nodes();
    const base = kind.toLowerCase();
    let n = nodes.length + 1;
    while (nodes.some((x) => x.id === `${base}-${n}`)) n++;
    const id = `${base}-${n}`;
    const sub = KINDS[kind].fixed?.[0] ?? this.#registryBindings(kind)[0] ?? 'Not chosen yet';
    const x = after ? after.x + 260 : nodes.length ? Math.max(...nodes.map((s) => s.x)) + 260 : 40;
    const y = after ? after.y + (this.edges().some(([a]) => a === after.id) ? 120 : 0) : 170;
    this.nodes.set([...nodes, { id, kind, label: `New ${base} step`, sub, x: clamp(x), y: clamp(y) }]);
    if (after) this.edges.update((e) => [...e, [after.id, id]]);
    this.selected.set(id);
  }

  #patch(id: string, change: Partial<WorkflowNode>): void {
    this.nodes.update((nodes) => nodes.map((n) => (n.id === id ? { ...n, ...change } : n)));
  }

  protected rename(value: string): void {
    const n = this.sel();
    if (n && value.trim()) this.#patch(n.id, { label: value.trim().slice(0, 120) });
  }

  protected onBind(event: CustomEvent<{ value: unknown }>): void {
    const n = this.sel();
    if (n) this.#patch(n.id, { sub: String(event.detail.value) });
  }

  protected onFailure(event: CustomEvent<SegmentValueChange>): void {
    event.preventDefault();
    const n = this.sel();
    if (!n) return;
    const v = event.detail.value as Failure;
    const { onFailure: _, ...rest } = n;
    this.nodes.update((nodes) =>
      nodes.map((x) => (x.id === n.id ? (v === 'stop' ? rest : { ...rest, onFailure: v }) : x)),
    );
  }

  protected connect(event: CustomEvent<{ value: unknown }>): void {
    const n = this.sel();
    const to = String(event.detail.value ?? '');
    if (n && to) this.edges.update((e) => [...e, [n.id, to]]);
  }

  protected disconnect(to: string): void {
    const n = this.sel();
    if (n) this.edges.update((e) => e.filter(([a, b]) => !(a === n.id && b === to)));
  }

  protected remove(): void {
    const n = this.sel();
    if (!n) return;
    this.nodes.update((nodes) => nodes.filter((x) => x.id !== n.id));
    this.edges.update((e) => e.filter(([a, b]) => a !== n.id && b !== n.id));
    this.selected.set(null);
  }

  protected onTier(event: CustomEvent<{ value: unknown }>): void {
    this.sensitivity.set(event.detail.value as Sensitivity);
  }

  protected discard(): void {
    const w = this.item();
    this.name.set(w.name);
    this.sensitivity.set(w.sensitivity);
    this.nodes.set(w.details.nodes.map((n) => ({ ...n })));
    this.edges.set(w.details.edges.map(([a, b]) => [a, b] as Edge));
    this.selected.set(null);
    toast.info('Changes discarded', { description: w.name });
  }

  /** Saves the graph as the next version and sends it to review. Blocking checks stop it here, as the API would. */
  protected async save(): Promise<void> {
    if (!this.nodes().length) {
      toast.error('Add a step first', { description: 'Start with a trigger, from Add.' });
      return;
    }
    const blocking = this.blocking();
    if (blocking) {
      toast.error(`${blocking} blocking ${blocking === 1 ? 'issue' : 'issues'}`, {
        description: 'Fix the checks marked Blocking before saving.',
      });
      return;
    }
    const body: WorkflowGraph = {
      revision: this.item().revision,
      name: this.name().trim() || this.item().name,
      sensitivity: this.sensitivity(),
      nodes: this.nodes(),
      edges: this.edges(),
    };
    this.saving.set(true);
    try {
      const saved = await firstValueFrom(
        this.#http.put<Workflow>(`/api/registry/workflow/${encodeURIComponent(this.item().id)}/graph`, body),
      );
      toast.success('Sent for review', { description: `${saved.name} ${saved.version}: two reviewers publish it.` });
      this.selected.set(null);
      this.saved.emit();
      void this.#router.navigate([], { queryParams: { mode: null }, queryParamsHandling: 'merge', replaceUrl: true });
    } catch (e) {
      const message = e instanceof HttpErrorResponse ? (e.error?.message as string | undefined) : undefined;
      toast.error("Couldn't save the workflow", { description: message ?? 'Try again in a moment.' });
    } finally {
      this.saving.set(false);
    }
  }
}
