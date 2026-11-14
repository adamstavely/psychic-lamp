import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { catchError, throwError } from 'rxjs';

/**
 * A 401 from the API means the session is no longer good (expired, revoked, or signed by keys the identity provider
 * has rotated). Send the person back through sign-in, returning to where they were, instead of showing the failure
 * as if the thing they asked for didn't exist.
 */
export const unauthorizedInterceptor: HttpInterceptorFn = (req, next) => {
  const oidc = inject(OidcSecurityService);
  return next(req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401 && req.url.startsWith('/api/')) {
        // Reloading without the stale session lets the sign-in guard save this page and come back to it.
        oidc.logoffLocal();
        location.reload();
      }
      return throwError(() => err);
    }),
  );
};
