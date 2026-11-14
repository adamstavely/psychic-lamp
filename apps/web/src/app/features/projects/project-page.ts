import { HttpClient, httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { Checkbox } from '@adamstavely/trenchcoat/angular/checkbox';
import { CitedAnswer } from '@adamstavely/trenchcoat/angular/cited-answer';
import { Switch } from '@adamstavely/trenchcoat/angular/switch';
import type { CitedSegment, CitedSource } from '@adamstavely/trenchcoat/cited-answer';
import { toast } from '@adamstavely/trenchcoat/toaster';
import type { CitedText, Project, ProjectAnswer, ProjectSource } from '@donovan/contracts';
import { firstValueFrom } from 'rxjs';
import { relativeDay } from '../brief/format';

const KIND: Record<ProjectSource['kind'], string> = {
  pdf: 'PDF',
  sheet: 'Sheet',
  doc: 'Doc',
  slack: 'Slack',
  connector: 'Live connector',
  web: 'Web',
  dataset: 'Dataset',
};

/** A project: the sources it reads, a guide and answers that cite them, notes, and the chats filed under it. */
@Component({
  selector: 'dn-project-page',
  imports: [FormsModule, RouterLink, Button, Checkbox, CitedAnswer, Switch],
  templateUrl: './project-page.html',
  styleUrl: './project-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ProjectPage {
  /** From the route. */
  readonly projectId = input.required<string>();
  readonly #http = inject(HttpClient);
  readonly #title = inject(Title);

  protected readonly project = httpResource<Project>(() => `/api/projects/${encodeURIComponent(this.projectId())}`);
  protected readonly p = computed(() => (this.project.hasValue() ? this.project.value() : null));
  protected readonly kind = KIND;
  protected readonly now = new Date();
  protected readonly selectedCount = computed(() => this.p()?.sources.filter((s) => s.selected).length ?? 0);
  protected readonly citedSources = computed<CitedSource[]>(
    () => this.p()?.sources.map((s) => ({ id: s.id, title: s.title, site: s.meta })) ?? [],
  );

  protected readonly answer = signal<ProjectAnswer | null>(null);
  protected readonly asking = signal(false);
  protected readonly status = signal('');
  protected question = '';

  constructor() {
    effect(() => {
      const p = this.p();
      if (p) this.#title.setTitle(`${p.name} · Projects · Donovan`);
    });
  }

  protected segments(text: CitedText): CitedSegment[] {
    return text.map((s) => ({ text: s.text, ...(s.cite.length ? { cite: s.cite } : {}) }));
  }

  protected when(iso: string): string {
    return relativeDay(iso, this.now);
  }

  protected async toggleSource(source: ProjectSource, event: CustomEvent<{ value: unknown }>): Promise<void> {
    event.preventDefault();
    await this.change(() =>
      this.#http.put<void>(this.url(`sources/${source.id}/selected`), { selected: event.detail.value === true }),
    );
  }

  protected async setCalibrated(event: CustomEvent<{ value: unknown }>): Promise<void> {
    event.preventDefault();
    await this.change(() => this.#http.patch(this.url(''), { calibrated: event.detail.value === true }));
  }

  protected async addSources(ids: string[]): Promise<void> {
    await this.change(() => this.#http.post<void>(this.url('sources'), { ids }));
    this.status.set(ids.length === 1 ? 'Source added.' : `${ids.length} sources added.`);
  }

  protected async ask(question: string): Promise<void> {
    const q = question.trim();
    if (!q) return;
    this.asking.set(true);
    this.status.set(`Reading ${this.selectedCount()} sources…`);
    try {
      this.answer.set(await firstValueFrom(this.#http.post<ProjectAnswer>(this.url('ask'), { question: q })));
      this.status.set('Answer ready.');
      this.question = '';
    } catch (err) {
      const message = (err as { error?: { message?: string } }).error?.message;
      this.status.set('');
      toast.error("Couldn't answer that", { description: message ?? 'Try again in a moment.' });
    } finally {
      this.asking.set(false);
    }
  }

  protected async saveAnswer(): Promise<void> {
    const a = this.answer();
    if (!a) return;
    await this.addNote(`${a.question}\n\n${a.answer.map((s) => s.text).join('')}`);
  }

  protected async addNote(text: string): Promise<void> {
    await this.change(() => this.#http.post<void>(this.url('notes'), { text }));
    this.status.set('Saved to notes.');
  }

  protected async deleteNote(id: string): Promise<void> {
    await this.change(() => this.#http.delete<void>(this.url(`notes/${id}`)));
    this.status.set('Note deleted.');
  }

  protected async share(): Promise<void> {
    await navigator.clipboard.writeText(location.href);
    toast.success('Link copied', { description: 'People with access to this project can open it.' });
  }

  private url(path: string): string {
    return `/api/projects/${encodeURIComponent(this.projectId())}${path ? `/${path}` : ''}`;
  }

  private async change(call: () => ReturnType<HttpClient['post']>): Promise<void> {
    try {
      await firstValueFrom(call());
      this.project.reload();
    } catch {
      toast.error("Couldn't save that", { description: 'Try again in a moment.' });
    }
  }
}
