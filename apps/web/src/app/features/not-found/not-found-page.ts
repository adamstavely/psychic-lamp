import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'dn-not-found-page',
  imports: [RouterLink],
  template: `
    <section class="page">
      <h1>Page not found</h1>
      <p>That address doesn't match anything in Donovan. <a routerLink="/brief">Go to your Daily Brief</a>.</p>
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
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class NotFoundPage {}
