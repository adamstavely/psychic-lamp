import { HttpClient, httpResource } from '@angular/common/http';
import { computed, inject, Injectable } from '@angular/core';
import type { Me, Preferences, PreferencesPatch } from '@donovan/contracts';
import { PREFERENCE_DEFAULTS } from '@donovan/contracts/defaults';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom, map } from 'rxjs';

/** The signed-in person and their preferences. Preference changes show at once and are saved in the background. */
@Injectable({ providedIn: 'root' })
export class Session {
  readonly #http = inject(HttpClient);
  readonly #oidc = inject(OidcSecurityService);

  /** True once the sign-in check has finished and found a session; nothing asks the API before then. */
  readonly signedIn = toSignal(this.#oidc.isAuthenticated$.pipe(map((r) => r.isAuthenticated)), {
    initialValue: false,
  });

  readonly me = httpResource<Me>(() => (this.signedIn() ? '/api/me' : undefined));
  readonly #stored = httpResource<Preferences>(() => (this.signedIn() ? '/api/me/preferences' : undefined));

  readonly preferences = computed<Preferences>(() =>
    this.#stored.hasValue() ? this.#stored.value() : PREFERENCE_DEFAULTS,
  );

  async updatePreferences(patch: PreferencesPatch): Promise<void> {
    const before = this.preferences();
    this.#stored.set({ ...before, ...patch });
    try {
      this.#stored.set(await firstValueFrom(this.#http.patch<Preferences>('/api/me/preferences', patch)));
    } catch (err) {
      this.#stored.set(before);
      throw err;
    }
  }

  signOut(): void {
    this.#oidc.logoff().subscribe();
  }
}
