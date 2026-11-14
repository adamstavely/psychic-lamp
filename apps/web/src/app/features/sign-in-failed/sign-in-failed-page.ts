import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { OidcSecurityService } from 'angular-auth-oidc-client';

/** Where sign-in lands when it fails, instead of sending the person straight back to the sign-in page in a loop. */
@Component({
  selector: 'dn-sign-in-failed-page',
  imports: [Button],
  template: `
    <main id="main" class="page">
      <h1>We couldn't sign you in</h1>
      <p>Your sign-in didn't complete. Try again, and if it keeps happening, tell your administrator.</p>
      <tc-button variant="primary" label="Try again" (click)="retry()" />
    </main>
  `,
  styles: `
    .page {
      max-width: 36rem;
      margin: 15vh auto 0;
      padding: var(--tc-space-6);
    }
    h1 {
      margin: 0 0 var(--tc-space-2);
      font-size: var(--tc-font-size-2xl);
    }
    p {
      margin: 0 0 var(--tc-space-4);
      color: var(--tc-text-secondary);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class SignInFailedPage {
  readonly #oidc = inject(OidcSecurityService);

  protected retry(): void {
    this.#oidc.authorize();
  }
}
