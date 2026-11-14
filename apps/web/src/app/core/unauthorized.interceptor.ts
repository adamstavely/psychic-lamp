import { HttpErrorResponse, HttpResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject, InjectionToken } from '@angular/core';
import { Router } from '@angular/router';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { catchError, tap, throwError } from 'rxjs';

const KEY = 'dn-reauth';
/** Two trips through sign-in this close together mean signing in again isn't fixing it. */
const WINDOW_MS = 2 * 60_000;

/** When this tab last sent the person back through sign-in because the API said 401. */
function lastReauth(): number | null {
  try {
    const at = Number(sessionStorage.getItem(KEY));
    return at > 0 ? at : null;
  } catch {
    return null;
  }
}

function remember(at: number | null): void {
  try {
    if (at === null) sessionStorage.removeItem(KEY);
    else sessionStorage.setItem(KEY, String(at));
  } catch {
    // Storage blocked: the loop guard falls back to this page's lifetime (below).
  }
}

/** Reloads the page (a token, so tests can watch it). */
export const RELOAD = new InjectionToken<() => void>('reload', { factory: () => () => location.reload() });

let leaving = false;

/**
 * A 401 from the API usually means the session is no longer good (expired, revoked, or signed by keys the identity
 * provider has rotated): the person goes back through sign-in once, returning to where they were.
 *
 * If the API says 401 again within a couple of minutes of that, a fresh sign-in isn't helping: the API and the
 * identity provider disagree (the token's audience or issuer, say) or the provider is failing. Then the person sees a
 * page that says so, with Try again, instead of being sent round sign-in in a loop. A request that succeeds clears it.
 */
export const unauthorizedInterceptor: HttpInterceptorFn = (req, next) => {
  const oidc = inject(OidcSecurityService);
  const router = inject(Router);
  const reload = inject(RELOAD);
  const api = req.url.startsWith('/api/');
  return next(req).pipe(
    tap((event) => {
      if (api && event instanceof HttpResponse && lastReauth() !== null) remember(null);
    }),
    catchError((err: unknown) => {
      if (api && err instanceof HttpErrorResponse && err.status === 401 && !leaving) {
        leaving = true;
        const last = lastReauth();
        if (last !== null && Date.now() - last < WINDOW_MS) {
          remember(null);
          oidc.logoffLocal();
          void router.navigateByUrl('/unauthorized?reason=rejected').finally(() => (leaving = false));
        } else {
          remember(Date.now());
          // Reloading without the stale session lets the sign-in guard save this page and come back to it.
          oidc.logoffLocal();
          reload();
          leaving = false;
        }
      }
      return throwError(() => err);
    }),
  );
};
