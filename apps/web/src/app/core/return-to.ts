import {
  EnvironmentInjector,
  inject,
  provideEnvironmentInitializer,
  runInInjectionContext,
  type EnvironmentProviders,
} from '@angular/core';
import { NavigationEnd, Router, type CanActivateFn } from '@angular/router';
import { autoLoginPartialRoutesGuard, OidcSecurityService } from 'angular-auth-oidc-client';
import { catchError, filter, first, map, of, switchMap, tap, timeout } from 'rxjs';

const KEY = 'donovan.returnTo';
/** How long to wait for the identity provider's discovery document before saying it can't be reached. */
export const PROVIDER_TIMEOUT_MS = 10_000;

/**
 * Requires sign-in, remembering the page asked for. angular-auth-oidc-client restores its own saved page while the app
 * starts, before the router's first navigation, which then lands on "/" and wins; this keeps the page until that
 * navigation is done (see provideReturnAfterSignIn).
 *
 * Before sending someone to sign in, it checks the identity provider answers: when it doesn't, the library's guard
 * just refuses the page and leaves it blank, so this explains instead (/unauthorized?reason=unreachable).
 */
export const signInGuard: CanActivateFn = (route, state) => {
  const oidc = inject(OidcSecurityService);
  const router = inject(Router);
  const injector = inject(EnvironmentInjector);
  const unreachable = () => router.createUrlTree(['/unauthorized'], { queryParams: { reason: 'unreachable' } });
  return oidc.isAuthenticated$.pipe(
    first(),
    switchMap(({ isAuthenticated }) =>
      isAuthenticated
        ? of(true)
        : oidc.preloadAuthWellKnownDocument().pipe(
            timeout(PROVIDER_TIMEOUT_MS),
            map(() => true),
            catchError(() => of(unreachable())),
          ),
    ),
    switchMap((ok) =>
      ok !== true
        ? of(ok)
        : runInInjectionContext(injector, () => autoLoginPartialRoutesGuard(route, state)).pipe(
            tap((signedIn) => {
              if (!signedIn) sessionStorage.setItem(KEY, state.url);
            }),
          ),
    ),
  );
};

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
