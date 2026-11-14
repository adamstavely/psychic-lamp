import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { firstValueFrom } from 'rxjs';
import { RELOAD, unauthorizedInterceptor } from './unauthorized.interceptor';

describe('unauthorizedInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  const reload = vi.fn();
  const navigateByUrl = vi.fn(() => Promise.resolve(true));
  const logoffLocal = vi.fn();

  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([unauthorizedInterceptor])),
        provideHttpClientTesting(),
        { provide: RELOAD, useValue: reload },
        { provide: Router, useValue: { navigateByUrl } },
        { provide: OidcSecurityService, useValue: { logoffLocal } },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  const call = async (status: number) => {
    const done = firstValueFrom(http.get('/api/me')).catch(() => undefined);
    backend.expectOne('/api/me').flush({}, { status, statusText: status === 200 ? 'OK' : 'Unauthorized' });
    await done;
  };

  it('sends the person back through sign-in once', async () => {
    await call(401);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('stops, and says why, when the API refuses a fresh sign-in too', async () => {
    await call(401);
    await call(401);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(navigateByUrl).toHaveBeenCalledWith('/unauthorized?reason=rejected');
  });

  it('forgets the last trip once a request succeeds', async () => {
    await call(401);
    await call(200);
    await call(401);
    expect(reload).toHaveBeenCalledTimes(2);
    expect(navigateByUrl).not.toHaveBeenCalled();
  });
});
