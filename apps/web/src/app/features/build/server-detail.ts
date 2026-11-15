import { HttpClient, httpResource } from '@angular/common/http';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  type ElementRef,
  inject,
  Injector,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { Dialog } from '@adamstavely/trenchcoat/angular/dialog';
import { RadioGroup } from '@adamstavely/trenchcoat/angular/radio-group';
import type { SettingsRadioOption } from '@adamstavely/trenchcoat/radio-group';
import { CodeBlock } from '@adamstavely/trenchcoat/angular/code-block';
import { toast } from '@adamstavely/trenchcoat/toaster';
import type { InstallClient, RegistryInstall, RegistryItem, TryResult } from '@donovan/contracts';
import { INSTALL_CLIENTS } from '@donovan/contracts/defaults';
import { firstValueFrom } from 'rxjs';
import { ownOpenChange } from './dialog-events';
import { chatStart } from './use-in-chat';

type Server = Extract<RegistryItem, { kind: 'server' }>;
type Tool = Server['details']['tools'][number];

/** An MCP server on one page: its tools (each can be tried in a sandbox) beside how to install it and its details. */
@Component({
  selector: 'dn-server-detail',
  imports: [Button, CodeBlock, Dialog, RadioGroup],
  templateUrl: './server-detail.html',
  styleUrls: ['./detail.css', './server-detail.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServerDetail {
  readonly item = input.required<Server>();
  readonly #http = inject(HttpClient);
  readonly #injector = inject(Injector);

  readonly #router = inject(Router);
  protected useInChat(): void {
    void this.#router.navigate(['/chats/new'], { queryParams: chatStart(this.item()) });
  }
  protected readonly needsSignIn = computed(() => !/^none\b/i.test(this.item().details.auth));
  protected readonly publisher = computed(() => this.item().slug.split('/')[0]);
  protected readonly cli = computed(
    () =>
      `donovan servers add ${this.item().slug}@${this.item().version}\ndonovan servers allow ${this.item().slug} --tools read_only`,
  );

  // Try a tool: a sandbox run against a mock.
  private readonly tryBody = viewChild.required<ElementRef<HTMLElement>>('tryBody');
  protected readonly own = ownOpenChange;
  protected readonly trying = signal<Tool | null>(null);
  protected readonly tryNote = computed(() => {
    const t = this.trying();
    const s = this.item();
    return t
      ? `${s.name} · ${s.details.transport}. A sandbox run: it answers like the real tool, but nothing is called and nothing changes${t.write ? ', even though this is a write tool' : ''}.`
      : '';
  });
  protected args: Record<string, string> = {};
  protected readonly running = signal(false);
  protected readonly result = signal<TryResult | null>(null);
  protected readonly tryError = signal('');

  protected openTry(tool: Tool): void {
    this.trying.set(tool);
    this.args = Object.fromEntries(tool.params.map((p) => [p.name, '']));
    this.result.set(null);
    this.tryError.set('');
    // The fields render with the tool and the dialog opens with them: focus goes to the first one.
    afterNextRender(() => this.tryBody().nativeElement.querySelector<HTMLInputElement>('input')?.focus(), {
      injector: this.#injector,
    });
  }

  protected async runTry(): Promise<void> {
    const tool = this.trying();
    if (!tool || this.running()) return;
    this.running.set(true);
    this.tryError.set('');
    try {
      const url = `/api/registry/server/${encodeURIComponent(this.item().id)}/tools/${encodeURIComponent(tool.name)}/try`;
      this.result.set(await firstValueFrom(this.#http.post<TryResult>(url, { args: this.args })));
    } catch (err) {
      this.result.set(null);
      this.tryError.set(
        (err as { error?: { message?: string } }).error?.message ?? "The sandbox didn't answer. Try again.",
      );
    } finally {
      this.running.set(false);
    }
  }

  // Install in a client: recorded per person.
  protected readonly installs = httpResource<RegistryInstall[]>(
    () => `/api/registry/server/${encodeURIComponent(this.item().id)}/installs`,
  );
  protected readonly installedIn = computed(() =>
    (this.installs.hasValue() ? this.installs.value() : []).map((i) => i.client),
  );
  protected label(client: InstallClient): string {
    return INSTALL_CLIENTS.find((c) => c.id === client)!.label;
  }

  protected readonly clientOptions: SettingsRadioOption[] = INSTALL_CLIENTS.map((c) => ({
    value: c.id,
    label: c.label,
  }));
  protected readonly installOpen = signal(false);
  protected readonly client = signal<InstallClient>('donovan-chat');
  protected readonly installing = signal(false);
  protected readonly snippet = signal('');

  protected openInstall(): void {
    this.updateSnippet();
    this.installOpen.set(true);
  }

  protected updateSnippet(): void {
    const s = this.item();
    const config = {
      mcpServers: {
        [s.id]: { transport: s.details.transport.toLowerCase(), url: `https://gateway.donovan.internal/${s.slug}` },
      },
    };
    this.snippet.set(JSON.stringify(config, null, 2));
  }

  protected async install(): Promise<void> {
    this.installing.set(true);
    try {
      const url = `/api/registry/server/${encodeURIComponent(this.item().id)}/installs`;
      this.installs.set(await firstValueFrom(this.#http.post<RegistryInstall[]>(url, { client: this.client() })));
      toast.success(`Installed ${this.item().name}`, { description: `Added to ${this.label(this.client())}.` });
      this.installOpen.set(false);
    } catch (err) {
      toast.error(`Couldn't install ${this.item().name}`, {
        description: (err as { error?: { message?: string } }).error?.message ?? 'Try again in a moment.',
      });
    } finally {
      this.installing.set(false);
    }
  }

  protected async uninstall(client: InstallClient): Promise<void> {
    try {
      const url = `/api/registry/server/${encodeURIComponent(this.item().id)}/installs/${client}`;
      this.installs.set(await firstValueFrom(this.#http.delete<RegistryInstall[]>(url)));
      toast.success(`Removed from ${this.label(client)}`);
    } catch {
      toast.error("Couldn't remove it", { description: 'Try again in a moment.' });
    }
  }
}
