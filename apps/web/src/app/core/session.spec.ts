import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { PREFERENCE_DEFAULTS } from '@donovan/contracts/defaults';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { of } from 'rxjs';
import { Session } from './session';

describe('Session', () => {
  let session: Session;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: OidcSecurityService,
          useValue: { isAuthenticated$: of({ isAuthenticated: true }), logoff: () => of(null) },
        },
      ],
    });
    session = TestBed.inject(Session);
    http = TestBed.inject(HttpTestingController);
    TestBed.tick();
    http.expectOne('/api/me').flush({ id: 'u', name: 'Alex Morgan', firstName: 'Alex', email: null, initials: 'AM' });
    http.expectOne('/api/me/preferences').flush(PREFERENCE_DEFAULTS);
  });

  afterEach(() => http.verify());

  it('shows a preference change at once and keeps what the API saved', async () => {
    const saving = session.updatePreferences({ theme: 'dark' });
    expect(session.preferences().theme).toBe('dark');
    http.expectOne({ method: 'PATCH', url: '/api/me/preferences' }).flush({ ...PREFERENCE_DEFAULTS, theme: 'dark' });
    await saving;
    expect(session.preferences().theme).toBe('dark');
  });

  it('undoes the change when saving fails', async () => {
    const saving = session.updatePreferences({ railExpanded: false });
    expect(session.preferences().railExpanded).toBe(false);
    http.expectOne('/api/me/preferences').flush('down', { status: 503, statusText: 'Unavailable' });
    await expect(saving).rejects.toBeTruthy();
    expect(session.preferences().railExpanded).toBe(true);
  });
});
