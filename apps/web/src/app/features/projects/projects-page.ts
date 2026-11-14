import { HttpClient, httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { toast } from '@adamstavely/trenchcoat/toaster';
import type { ProjectsOverview, ProjectSummary, Sensitivity } from '@donovan/contracts';
import { firstValueFrom } from 'rxjs';
import { IconDirective } from '../../core/icon.directive';
import { initials } from '../brief/format';

const DATE = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

/** Libraries shared across the organisation, and the person's own projects; start a new one (a library opens to copy). */
@Component({
  selector: 'dn-projects-page',
  imports: [FormsModule, RouterLink, Button, IconDirective],
  templateUrl: './projects-page.html',
  styleUrl: './projects-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ProjectsPage {
  readonly #http = inject(HttpClient);
  readonly #router = inject(Router);

  protected readonly overview = httpResource<ProjectsOverview>(() => '/api/projects');
  protected readonly filter = signal('');
  protected readonly initials = initials;

  protected readonly mine = computed(() => {
    const q = this.filter().trim().toLowerCase();
    const all = this.overview.hasValue() ? this.overview.value().mine : [];
    return q ? all.filter((p) => p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q)) : all;
  });
  protected readonly org = computed(() => {
    const q = this.filter().trim().toLowerCase();
    const all = this.overview.hasValue() ? this.overview.value().org : [];
    return q ? all.filter((p) => p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q)) : all;
  });

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('newDialog');
  protected readonly draft = { name: '', sensitivity: 'Internal' as Sensitivity, calibrated: false };
  protected readonly creating = signal(false);
  protected readonly error = signal('');

  protected date(iso: string): string {
    return DATE.format(new Date(iso));
  }

  protected openNew(): void {
    Object.assign(this.draft, { name: '', sensitivity: 'Internal', calibrated: false });
    this.error.set('');
    this.dialog().nativeElement.showModal();
  }

  protected closeNew(): void {
    this.dialog().nativeElement.close();
  }

  protected async create(): Promise<void> {
    if (!this.draft.name.trim()) {
      this.error.set('Name the project.');
      return;
    }
    await this.start({ ...this.draft, name: this.draft.name.trim() });
    this.closeNew();
  }

  private async start(body: object): Promise<void> {
    this.creating.set(true);
    try {
      const p = await firstValueFrom(this.#http.post<ProjectSummary>('/api/projects', body));
      toast.success(`Created ${p.name}`);
      await this.#router.navigate(['/projects', p.id]);
    } catch {
      toast.error("Couldn't create the project", { description: 'Try again in a moment.' });
    } finally {
      this.creating.set(false);
    }
  }
}
