import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ChatComposer } from '@adamstavely/trenchcoat/angular/chat-composer';
import { PromptStarters } from '@adamstavely/trenchcoat/angular/prompt-starters';
import { SensitivityLabelPicker } from '@adamstavely/trenchcoat/angular/sensitivity-label-picker';
import { Select } from '@adamstavely/trenchcoat/angular/select';
import { Switch } from '@adamstavely/trenchcoat/angular/switch';
import type { ChatSendDetails } from '@adamstavely/trenchcoat/chat-composer';
import type { PromptStarter } from '@adamstavely/trenchcoat/prompt-starters';
import type { SelectOption } from '@adamstavely/trenchcoat/select';
import type { SensitivityLabel } from '@adamstavely/trenchcoat/sensitivity-label-picker';
import { toast } from '@adamstavely/trenchcoat/toaster';
import type { ChatSummary, ModelChoice, Sensitivity } from '@donovan/contracts';
import { firstValueFrom } from 'rxjs';
import { ChatsStore } from '../../core/chats-store';
import { ProjectsStore } from '../../core/projects-store';
import { dictate } from '../../core/dictation';
import { Session } from '../../core/session';
import { COMPOSER_MODELS, PENDING_SEND, type PendingSend } from './composer';
import { ComposerFiles } from './composer-files';

const SENSITIVITIES: SensitivityLabel[] = [
  { id: 'Public', label: 'Public', description: 'Anyone, inside or outside the company', level: 0 },
  { id: 'Internal', label: 'Internal', description: 'Everyone in the workspace', level: 1 },
  { id: 'Confidential', label: 'Confidential', description: 'Named teams; write tools need approval', level: 2 },
  { id: 'Restricted', label: 'Restricted', description: 'Named people; every tool call is reviewed', level: 3 },
];

const STARTERS: PromptStarter[] = [
  {
    id: 'prep',
    label: 'Prep for a meeting',
    text: 'What should I prep for the 2:00 PM go/no-go?',
    hint: 'Calendar and mail',
  },
  {
    id: 'summarize',
    label: 'Summarize a dataset',
    text: 'Summarize last week of support intents by product line.',
    hint: 'Support DW',
  },
  {
    id: 'draft',
    label: 'Draft a reply',
    text: 'Draft a reply to Mara about the go/no-go moving to 2:00 PM.',
    hint: 'In your voice',
  },
  {
    id: 'compare',
    label: 'Compare two models',
    text: 'Compare Churn Propensity v1.8 and v2.0 on the 90-day holdout.',
    hint: 'Model evals',
  },
];

/** Where a new chat starts: the composer, with routing on Auto, and a few ways in. */
@Component({
  selector: 'dn-chats-home-page',
  imports: [ChatComposer, PromptStarters, Select, SensitivityLabelPicker, Switch],
  templateUrl: './chats-home-page.html',
  styleUrl: './chats-home-page.css',
  providers: [ComposerFiles],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ChatsHomePage {
  /** A question handed over in the URL (from the Daily Brief's ask box, or Build's Use in chat), to start with. */
  readonly q = input<string>();
  /** A project to start in (from a project's New chat), by id; ignored unless it's one of the person's. */
  readonly project = input<string>();
  /** A model to start with, from Build's Use in chat; ignored unless the composer offers it. */
  readonly model = input<string>();
  protected readonly startModel = computed(() => {
    const m = this.model();
    return m && COMPOSER_MODELS.some((c) => c.id === m) ? m : 'auto';
  });

  readonly #http = inject(HttpClient);
  readonly #router = inject(Router);
  readonly #chats = inject(ChatsStore);
  readonly #session = inject(Session);

  protected readonly models = COMPOSER_MODELS;
  protected readonly dictate = dictate;
  protected readonly files = inject(ComposerFiles);
  protected readonly starters = STARTERS;
  protected readonly sensitivities = SENSITIVITIES;
  protected readonly sensitivity = signal<Sensitivity>('Internal');
  readonly #projects = inject(ProjectsStore);
  /** The project picked here, or else the one the URL named. */
  readonly #picked = signal<string | null>(null);
  protected readonly projectId = computed(() => {
    const id = this.#picked() ?? this.project() ?? '';
    return this.#projects.mine().some((p) => p.id === id) ? id : '';
  });
  protected readonly projectOptions = computed<SelectOption[]>(() => [
    { value: '', label: 'No project' },
    ...this.#projects.mine().map((p) => ({
      value: p.id,
      label: p.name,
      ...(p.calibrated ? { description: 'Calibrated' } : {}),
    })),
  ]);
  /** A Calibrated project's chats are Calibrated; otherwise the person chooses. */
  protected readonly projectCalibrated = computed(
    () => this.#projects.mine().find((p) => p.id === this.projectId())?.calibrated ?? false,
  );
  /** Start the chat Calibrated: its answers label each claim. */
  protected readonly calibrated = signal(false);

  protected onProject(event: CustomEvent<{ value: unknown }>): void {
    this.#picked.set(String(event.detail.value));
  }
  protected readonly date = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date());
  protected readonly heading = computed(() =>
    this.#session.me.hasValue()
      ? `What should we work on, ${this.#session.me.value().firstName}?`
      : 'What should we work on?',
  );
  protected readonly draft = signal<string | null>(null);
  protected readonly value = computed(() => this.draft() ?? this.q() ?? '');

  protected readonly send = (message: string, details: ChatSendDetails): Promise<void> =>
    this.start(message, details.model as ModelChoice);

  protected onSensitivity(event: CustomEvent<{ value: unknown }>): void {
    if (typeof event.detail.value === 'string') this.sensitivity.set(event.detail.value as Sensitivity);
  }

  protected fill(event: CustomEvent<{ text: unknown }>): void {
    this.draft.set(String(event.detail.text));
  }

  protected sendStarter(event: CustomEvent<{ text: unknown }>): void {
    // start() has said what went wrong already.
    this.start(String(event.detail.text), 'auto').catch(() => undefined);
  }

  private async start(text: string, model: ModelChoice): Promise<void> {
    try {
      const chat = await firstValueFrom(
        this.#http.post<ChatSummary>('/api/chats', {
          text,
          sensitivity: this.sensitivity(),
          calibrated: this.calibrated() || this.projectCalibrated(),
          ...(this.projectId() ? { projectId: this.projectId() } : {}),
        }),
      );
      this.#chats.list.reload();
      const state: Record<string, PendingSend> = {
        [PENDING_SEND]: { text, model, attachments: this.files.ids() },
      };
      this.files.clear();
      await this.#router.navigate(['/chats', chat.id], { state });
    } catch {
      toast.error("Couldn't start the chat", { description: 'Check your connection and try again.' });
      throw new Error('start failed');
    }
  }
}
