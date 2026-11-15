import { httpResource } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import type { RegistryCounts } from '@donovan/contracts';

/**
 * How many items each Build area holds, for the rail. Loaded while Build is open; whatever changes the registry
 * (registering, a review decision, a new workflow) reloads it so the counts don't go stale.
 */
@Injectable({ providedIn: 'root' })
export class RegistryCountsStore {
  readonly #active = signal(false);
  readonly counts = httpResource<RegistryCounts>(() => (this.#active() ? '/api/registry/counts' : undefined));

  setActive(active: boolean): void {
    this.#active.set(active);
  }

  changed(): void {
    if (this.#active()) this.counts.reload();
  }
}
