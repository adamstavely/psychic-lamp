import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CodeBlock } from '@adamstavely/trenchcoat/angular/code-block';
import { DataTable } from '@adamstavely/trenchcoat/angular/data-table';
import { MeterRow } from '@adamstavely/trenchcoat/angular/meter-row';
import type { Artifact } from '@donovan/contracts';
import { tableFor } from '../chats/blocks';
import { blocksAt } from './artifact-view';

/** An artifact's content at one version: a document (marking what that version added), a notebook, or data. */
@Component({
  selector: 'dn-artifact-body',
  imports: [CodeBlock, DataTable, MeterRow],
  templateUrl: './artifact-body.html',
  styleUrl: './artifact-body.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArtifactBody {
  readonly a = input.required<Artifact>();
  readonly version = input.required<number>();

  protected readonly tableFor = tableFor;
  protected readonly blocks = computed(() => {
    const a = this.a();
    return a.body.kind === 'Doc' ? blocksAt(a.body.blocks, this.version()) : [];
  });
  protected readonly dataTable = computed(() => {
    const body = this.a().body;
    return body.kind === 'Data' ? tableFor({ type: 'table', columns: body.columns, rows: body.rows }) : null;
  });

  protected barMax(items: { value: number }[]): number {
    return Math.max(...items.map((i) => i.value));
  }
}
