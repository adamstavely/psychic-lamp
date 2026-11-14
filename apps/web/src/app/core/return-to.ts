import { inject, provideEnvironmentInitializer, type EnvironmentProviders } from '@angular/core';
import { NavigationEnd, Router, type CanActivateFn } from '@angular/router';
import { autoLoginPartialRoutesGuard, OidcSecurityService } from 'angular-auth-oidc-client';
import { filter, first, map, tap } from 'rxjs';

const KEY = 'donovan.returnTo';

/**
 * Requires sign-in, remembering the page asked for. angular-auth-oidc-client restores its own saved page while the app
 * starts, before the router's first navigation, which then lands on "/" and wins; this keeps the page until that
 * navigation is done (see provideReturnAfterSignIn).
 */
export const signInGuard: CanActivateFn = (route, state) =>
  autoLoginPartialRoutesGuard(route, state).pipe(
    tap((signedIn) => {
      if (!signedIn) sessionStorage.setItem(KEY, state.url);
    }),
  );

/** After the first navigation of a signed-in start, goes to the page remembered before sign-in, if any. */
export function provideReturnAfterSignIn(): EnvironmentProviders {
  return provideEnvironmentInitializer(() => {
    const router = inject(Router);
    const oidc = inject(OidcSecurityService);
    router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        first(),
        map(() => sessionStorage.getItem(KEY)),
        filter((url): url is string => !!url && url.startsWith('/')),
      )
      .subscribe((url) => {
        oidc.isAuthenticated$.pipe(first()).subscribe(({ isAuthenticated }) => {
          if (!isAuthenticated) return;
          sessionStorage.removeItem(KEY);
          if (url !== router.url) void router.navigateByUrl(url);
        });
      });
  });
}
