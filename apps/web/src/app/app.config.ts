import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { type ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, TitleStrategy, withComponentInputBinding } from '@angular/router';
import { authInterceptor, LogLevel, provideAuth, withAppInitializerAuthCheck } from 'angular-auth-oidc-client';
import { routes } from './app.routes';
import { provideReturnAfterSignIn } from './core/return-to';
import { RUNTIME_CONFIG, type RuntimeConfig } from './core/runtime-config';
import { DonovanTitleStrategy } from './core/title-strategy';
import { unauthorizedInterceptor } from './core/unauthorized.interceptor';

export function appConfig(runtime: RuntimeConfig): ApplicationConfig {
  return {
    providers: [
      provideBrowserGlobalErrorListeners(),
      { provide: RUNTIME_CONFIG, useValue: runtime },
      provideRouter(routes, withComponentInputBinding()),
      provideReturnAfterSignIn(),
      { provide: TitleStrategy, useClass: DonovanTitleStrategy },
      // The dev server proxies /api to the API (proxy.conf.json); deployed, the ingress does.
      provideHttpClient(withFetch(), withInterceptors([authInterceptor(), unauthorizedInterceptor])),
      provideAuth(
        {
          config: {
            authority: runtime.oidc.authority,
            clientId: runtime.oidc.clientId,
            redirectUrl: window.location.origin,
            postLogoutRedirectUri: window.location.origin,
            scope: 'openid profile email',
            responseType: 'code',
            silentRenew: true,
            useRefreshToken: true,
            renewTimeBeforeTokenExpiresInSeconds: 60,
            secureRoutes: ['/api/'],
            logLevel: LogLevel.Warn,
          },
        },
        withAppInitializerAuthCheck(),
      ),
    ],
  };
}
