import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { OidcSecurityService } from 'angular-auth-oidc-client';

/**
 * Where sign-in lands when it fails, instead of sending the person straight back to the sign-in page in a loop: when
 * the identity provider refused or failed, or (reason=rejected) when it signed them in but Donovan's server kept
 * refusing the result, or (reason=unreachable) when the identity provider didn't answer at all.
 */
@Component({
  selector: 'dn-sign-in-failed-page',
  imports: [Button],
  template: `
    <main id="main" class="page">
      @if (unreachable()) {
        <h1>Donovan can't reach the sign-in service</h1>
        <p>
          The service you sign in with isn't answering, so Donovan can't sign you in right now. Nothing you've saved is
          affected. Try again in a few minutes, and if it keeps happening, tell your administrator.
        </p>
      } @else if (rejected()) {
        <h1>Donovan didn't accept your sign-in</h1>
        <p>
          You signed in, but Donovan's server refused the sign-in twice in a row, so it stopped here rather than sending
          you round again. This is usually a setup problem rather than anything you did: try again, and if it keeps
          happening, tell your administrator (the server and the sign-in service may disagree about this app).
        </p>
      } @else {
        <h1>We couldn't sign you in</h1>
        <p>Your sign-in didn't complete. Try again, and if it keeps happening, tell your administrator.</p>
      }
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
  /** From the query string: rejected when the API kept refusing a fresh sign-in; unreachable when the provider is down. */
  readonly reason = input<string>();
  protected readonly rejected = computed(() => this.reason() === 'rejected');
  protected readonly unreachable = computed(() => this.reason() === 'unreachable');

  protected retry(): void {
    // Unreachable: start over from the app, which checks the service again; otherwise go straight to sign-in.
    if (this.unreachable()) window.location.assign('/');
    else this.#oidc.authorize();
  }
}
