import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import type { RegistryItem } from '@donovan/contracts';
import { chatStart } from './use-in-chat';

type Workflow = Extract<RegistryItem, { kind: 'workflow' }>;
type Node = Workflow['details']['nodes'][number];

/** Each step's box on the canvas, in the canvas's own units. */
const NODE = { w: 220, h: 88 };
const PAD = 24;

/** A workflow, view only: its graph, and the same steps as a list. Editing the canvas is slice 3. */
@Component({
  selector: 'dn-workflow-detail',
  imports: [Button],
  templateUrl: './workflow-detail.html',
  styleUrls: ['./detail.css', './workflow-detail.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkflowDetail {
  readonly item = input.required<Workflow>();
  readonly #router = inject(Router);
  protected readonly node = NODE;

  protected readonly box = computed(() => {
    const nodes = this.item().details.nodes;
    const w = Math.max(0, ...nodes.map((n) => n.x + NODE.w)) + PAD * 2;
    const h = Math.max(0, ...nodes.map((n) => n.y + NODE.h)) + PAD * 2;
    return { w, h, view: `${-PAD} ${-PAD} ${w} ${h}` };
  });

  /** A curve from the right edge of one step to the left edge of the next. */
  protected readonly edges = computed(() => {
    const byId = new Map(this.item().details.nodes.map((n) => [n.id, n]));
    return this.item().details.edges.flatMap(([from, to]) => {
      const a = byId.get(from);
      const b = byId.get(to);
      if (!a || !b) return [];
      const x1 = a.x + NODE.w;
      const y1 = a.y + NODE.h / 2;
      const x2 = b.x;
      const y2 = b.y + NODE.h / 2;
      return [{ key: `${from}-${to}`, d: `M${x1},${y1} C${x1 + 60},${y1} ${x2 - 60},${y2} ${x2},${y2}` }];
    });
  });

  /** The steps in the order they're laid out, each with the steps that follow it. */
  protected readonly steps = computed(() => {
    const d = this.item().details;
    const label = new Map(d.nodes.map((n) => [n.id, n.label]));
    return [...d.nodes]
      .sort((a, b) => a.x - b.x || a.y - b.y)
      .map((n: Node) => ({
        ...n,
        next: d.edges.filter(([from]) => from === n.id).map(([, to]) => label.get(to) ?? to),
      }));
  });

  protected useInChat(): void {
    void this.#router.navigate(['/chats/new'], { queryParams: chatStart(this.item()) });
  }
}
