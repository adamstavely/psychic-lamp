import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CodeBlock } from '@adamstavely/trenchcoat/angular/code-block';
import { MeterRow } from '@adamstavely/trenchcoat/angular/meter-row';
import type { Artifact } from '@donovan/contracts';
import { blocksAt } from './artifact-view';

/** An artifact's content at one version: a document (marking what that version added), a notebook, or data. */
@Component({
  selector: 'dn-artifact-body',
  imports: [CodeBlock, MeterRow],
  templateUrl: './artifact-body.html',
  styleUrl: './artifact-body.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArtifactBody {
  readonly a = input.required<Artifact>();
  readonly version = input.required<number>();

  protected readonly blocks = computed(() => {
    const a = this.a();
    return a.body.kind === 'Doc' ? blocksAt(a.body.blocks, this.version()) : [];
  });

  protected barMax(items: { value: number }[]): number {
    return Math.max(...items.map((i) => i.value));
  }
}
