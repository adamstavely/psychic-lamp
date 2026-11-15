import { httpResource } from '@angular/common/http';
import { computed, inject, Injectable } from '@angular/core';
import type { ProjectsOverview } from '@donovan/contracts';
import { Session } from './session';

/** The signed-in person's own projects, which chats can be filed under: the rail's folders and the composer's picker. */
@Injectable({ providedIn: 'root' })
export class ProjectsStore {
  readonly #session = inject(Session);

  readonly overview = httpResource<ProjectsOverview>(() => (this.#session.signedIn() ? '/api/projects' : undefined));
  readonly mine = computed(() => (this.overview.hasValue() ? this.overview.value().mine : []));
}
