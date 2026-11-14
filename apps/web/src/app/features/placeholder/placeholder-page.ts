import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Stands in for an area until its step of the Slice 1 plan lands. */
@Component({
  selector: 'dn-placeholder-page',
  template: `
    <section class="page">
      <h1>{{ heading() }}</h1>
      <p>This area is on its way.</p>
    </section>
  `,
  styles: `
    .page {
      padding: var(--tc-space-8);
    }
    h1 {
      margin: 0 0 var(--tc-space-2);
      font-size: var(--tc-font-size-2xl);
    }
    p {
      margin: 0;
      color: var(--tc-text-secondary);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class PlaceholderPage {
  /** From the route's data. */
  readonly heading = input.required<string>();
}
